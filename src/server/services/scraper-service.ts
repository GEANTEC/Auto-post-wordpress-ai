import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { dbRepo } from '../db/repository';
import { executeLlmPrompt } from './llm-gateway';
import { CapturedArticle, NewsSource, ArticleRewriteOptions, LLMProviderId } from '../../shared/types';
import { syncArticleToWordPress } from './wordpress-sync';
import { extractArticle } from './article-extractor';
import { uploadArticleJson, uploadFeedJson, generateContextualEditorialImage, isForbiddenImageService } from './r2-sync';
import { executeMcpAgyRewrite } from './agy-mcp-service';
import { parseRobustArticleJson, sanitizeArticleHtmlForPublish } from './article-cleaner';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const rssParser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: false }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: false }],
      ['enclosure', 'enclosure'],
    ],
  },
  headers: {
    'User-Agent': DEFAULT_USER_AGENT,
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
  timeout: 15000,
});

function extractImageUrlFromHtml(html: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function cleanHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Resolução resiliente de matérias de uma fonte:
 * 1. Parse de RSS/Atom direto
 * 2. Descoberta inteligente de RSS no DOM (<link rel="alternate" type="application/rss+xml">)
 * 3. Procura de endpoints de feed convencionais (/feed/, /rss/, etc.)
 * 4. Extração DOM direta via Cheerio diretamente no portal/categoria se não houver feed RSS
 */
async function fetchSourceItems(sourceUrl: string, sourceName: string): Promise<Array<{
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  pubDate?: string;
  enclosure?: { url?: string };
  mediaContent?: { $?: { url?: string } };
  mediaThumbnail?: { $?: { url?: string } };
}>> {
  // 1. Tentar parse direto de RSS/Atom
  try {
    const feed = await rssParser.parseURL(sourceUrl);
    if (feed && feed.items && feed.items.length > 0) {
      return feed.items as any;
    }
  } catch (feedError: any) {
    console.log(`[Scraper] Fonte "${sourceName}" (${sourceUrl}) não é feed XML direto. Iniciando detecção inteligente...`);
  }

  // 2. Requisição HTTP com cabeçalhos padrão de navegador para evitar bloqueios WAF/Cloudflare
  let htmlText = '';
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    htmlText = await response.text();
  } catch (err: any) {
    throw new Error(`Falha ao conectar com o portal "${sourceName}": ${err.message}`);
  }

  const $ = cheerio.load(htmlText);

  // 3. Procura tags <link> de RSS/Atom no DOM da página
  let discoveredFeedUrl =
    $('link[type="application/rss+xml"]').not('[href*="comments"]').first().attr('href') ||
    $('link[type="application/atom+xml"]').not('[href*="comments"]').first().attr('href') ||
    $('link[type*="rss"]').not('[href*="comments"]').first().attr('href') ||
    $('link[type*="atom"]').not('[href*="comments"]').first().attr('href') ||
    $('link[rel="alternate"][href*="feed"]').not('[href*="comments"]').first().attr('href') ||
    $('link[rel="alternate"][href*="rss"]').not('[href*="comments"]').first().attr('href');

  if (discoveredFeedUrl) {
    let resolvedFeedUrl = discoveredFeedUrl;
    if (!resolvedFeedUrl.startsWith('http')) {
      const base = new URL(sourceUrl);
      resolvedFeedUrl = new URL(resolvedFeedUrl, base.origin).toString();
    }
    try {
      const resolvedFeed = await rssParser.parseURL(resolvedFeedUrl);
      if (resolvedFeed && resolvedFeed.items && resolvedFeed.items.length > 0) {
        console.log(`[Scraper] Feed RSS detectado no HTML para "${sourceName}": ${resolvedFeedUrl} (${resolvedFeed.items.length} itens)`);
        return resolvedFeed.items as any;
      }
    } catch {
      // continua para endpoints comuns
    }
  }

  // 4. Procura endpoints de feed convencionais (/feed/, /rss/, etc.)
  try {
    const parsed = new URL(sourceUrl);
    const candidates = [
      new URL('/feed/', parsed.origin).toString(),
      new URL('/rss/', parsed.origin).toString(),
      new URL('/feed', parsed.origin).toString(),
      new URL('/rss.xml', parsed.origin).toString(),
    ];

    if (parsed.pathname && parsed.pathname.length > 1) {
      const cleanPath = sourceUrl.replace(/\/+$/, '');
      candidates.unshift(`${cleanPath}/feed/`, `${cleanPath}/feed`, `${cleanPath}/rss/`);
    }

    for (const cand of candidates) {
      try {
        const probedFeed = await rssParser.parseURL(cand);
        if (probedFeed && probedFeed.items && probedFeed.items.length > 0) {
          console.log(`[Scraper] Endpoint de feed encontrado para "${sourceName}": ${cand} (${probedFeed.items.length} itens)`);
          return probedFeed.items as any;
        }
      } catch {
        // continua tentando outros candidatos
      }
    }
  } catch {
    // ignora erros de url
  }

  // 5. Fallback Universal: Extração DOM direta da página inicial ou categoria do portal
  console.log(`[Scraper] Ativando extração DOM direta de matérias na página da fonte "${sourceName}"...`);
  const domArticles: Array<{ title: string; link: string; pubDate: string }> = [];
  const parsedHost = new URL(sourceUrl);

  $('article a, main a, [class*="noticia"] a, [class*="materia"] a, [class*="manchete"] a, [class*="destaque"] a, [class*="card"] a, h1 a, h2 a, h3 a').each((_, el) => {
    let href = $(el).attr('href');
    const title = $(el).text().trim();
    if (!href || !title || title.length < 15) return;

    if (!href.startsWith('http')) {
      href = new URL(href, sourceUrl).toString();
    }
    const clean = href.split('?')[0].split('#')[0];
    if (
      clean.includes(parsedHost.hostname) &&
      !clean.endsWith('.jpg') &&
      !clean.endsWith('.png') &&
      !clean.endsWith('.webp') &&
      !clean.includes('/tag/') &&
      !clean.includes('/categoria/') &&
      !clean.includes('/author/') &&
      !clean.includes('/sobre/') &&
      !clean.includes('/contato/') &&
      clean !== sourceUrl.replace(/\/+$/, '') &&
      clean !== parsedHost.origin
    ) {
      if (!domArticles.find((a) => a.link === clean)) {
        domArticles.push({
          title,
          link: clean,
          pubDate: new Date().toISOString(),
        });
      }
    }
  });

  if (domArticles.length > 0) {
    console.log(`[Scraper] Extração DOM direta identificou ${domArticles.length} notícias no portal "${sourceName}".`);
    return domArticles as any;
  }

  throw new Error(`Nenhum feed RSS ou matéria identificável no portal "${sourceName}" (${sourceUrl}).`);
}

export async function scrapeSource(sourceId: string): Promise<{
  source: NewsSource;
  totalFound: number;
  newCaptured: number;
  articles: CapturedArticle[];
}> {
  const source = dbRepo.getNewsSourceById(sourceId);
  if (!source) {
    throw new Error(`Fonte com ID ${sourceId} não foi encontrada.`);
  }

  const items = await fetchSourceItems(source.url, source.name);

  const capturedList: CapturedArticle[] = [];
  let newCount = 0;

  if (items.length === 0) {
    return {
      source,
      totalFound: 0,
      newCaptured: 0,
      articles: [],
    };
  }

  // Capturar EXCLUSIVAMENTE a última matéria (a mais recente do portal/feed)
  const latestItem = items[0];
  const initialLink = latestItem.link?.trim();
  const initialTitle = latestItem.title?.trim();

  if (initialLink && initialTitle) {
    // 1. Verificação prévia de duplicação: se a última matéria já foi salva, ignora e nunca duplica
    if (dbRepo.checkArticleUrlExists(initialLink)) {
      console.log(`[Scraper] Última matéria já capturada anteriormente (${initialLink}). Nenhuma duplicação gerada.`);
    } else {
      // Extrair imagem inicial de fallback
      let imgUrl: string | null = null;
      if (latestItem.enclosure?.url) {
        imgUrl = latestItem.enclosure.url;
      } else if (latestItem.mediaContent?.$?.url) {
        imgUrl = latestItem.mediaContent.$.url;
      } else if (latestItem.mediaThumbnail?.$?.url) {
        imgUrl = latestItem.mediaThumbnail.$.url;
      } else {
        imgUrl = extractImageUrlFromHtml(latestItem.content || '');
      }

      // 2. Extração profunda com DOM/Cheerio (Arquitetura painel-agy)
      let extracted: any = null;
      try {
        extracted = await extractArticle(initialLink);
      } catch (e: any) {
        console.warn(`[Scraper] Extração profunda falhou para ${initialLink}, usando dados do feed:`, e.message);
      }

      const finalUrl = extracted?.url || extracted?.canonicalUrl || initialLink;
      if (finalUrl !== initialLink && dbRepo.checkArticleUrlExists(finalUrl)) {
        console.log(`[Scraper] URL canônica da última matéria já existe (${finalUrl}). Ignorando duplicação.`);
      } else {
        const finalTitle = extracted?.title || initialTitle;
        const finalSubtitle = extracted?.subtitle || undefined;
        const finalAuthor = extracted?.author || undefined;
        const finalCleanHtml = extracted?.cleanHtml || undefined;
        const finalCleanText = extracted?.cleanText || undefined;
        const finalExcerpt =
          (extracted?.paragraphs && extracted.paragraphs.length > 0 ? extracted.paragraphs[0] : '') ||
          (latestItem.contentSnippet ? cleanHtmlTags(latestItem.contentSnippet).slice(0, 250) : '');
        // Foto de destaque real extraída do DOM/Cheerio ou fallback do feed
        const finalImage = extracted?.featuredImage?.url || imgUrl;
        const finalMediaData = extracted
          ? {
              featuredImage: extracted.featuredImage,
              internalImages: extracted.internalImages,
              videos: extracted.videos,
            }
          : undefined;
        const finalTags = extracted?.tags && extracted.tags.length > 0 ? extracted.tags : [];
        const rawContent = finalCleanHtml || latestItem.content || latestItem.contentSnippet || finalTitle;

        let newArticle = dbRepo.createCapturedArticle({
          sourceId: source.id,
          sourceName: source.name,
          originalUrl: finalUrl,
          originalTitle: finalTitle,
          originalContent: rawContent,
          originalExcerpt: finalExcerpt,
          subtitle: finalSubtitle,
          author: finalAuthor,
          cleanHtml: finalCleanHtml,
          cleanText: finalCleanText,
          imageUrl: finalImage,
          mediaData: finalMediaData,
          tags: finalTags,
          publishedAt:
            extracted?.publishedAt ||
            (latestItem.pubDate ? new Date(latestItem.pubDate).toISOString() : new Date().toISOString()),
          status: 'pending',
          aiTitle: null,
          aiContent: null,
          aiExcerpt: null,
          aiSeoKeywords: [],
          wpPostId: null,
          wpSiteId: null,
          wpPermalink: null,
        });

        // 3. Upload para Cloudflare R2 Edge Storage
        const settings = dbRepo.getSystemSettings();
        if (settings.r2AutoSync !== false) {
          try {
            const r2Url = await uploadArticleJson(newArticle);
            if (r2Url) {
              newArticle = dbRepo.updateCapturedArticle(newArticle.id, { r2JsonUrl: r2Url }) || newArticle;
            }
          } catch (r2Err: any) {
            console.warn(`[Scraper] Erro ao sincronizar artigo ${newArticle.id} no R2:`, r2Err.message);
          }
        }

        newCount++;
        capturedList.push(newArticle);

        // 4. Auto-reescrever com IA se configurado na fonte
        if (source.autoRewrite) {
          try {
            const rewritten = await rewriteArticleWithAi(newArticle.id, {
              targetSiteId: source.targetSiteId || undefined,
              autoPublish: source.autoPublish,
            });
            if (rewritten) {
              newArticle = rewritten;
            }
          } catch (aiErr) {
            console.error(`[Scraper] Falha ao auto-reescrever artigo ${newArticle.id}:`, aiErr);
          }
        }
      }
    }
  }

  // 4. Atualizar feeds agregados no Cloudflare R2 (Recife Timezone)
  const currentSettings = dbRepo.getSystemSettings();
  if (currentSettings.r2AutoSync !== false) {
    try {
      const recentArticles = dbRepo.getCapturedArticles({ limit: 100 });
      await uploadFeedJson(recentArticles);
    } catch (feedErr: any) {
      console.warn('[Scraper] Erro ao sincronizar feeds agregados no R2:', feedErr.message);
    }
  }

  // Atualizar fonte com data do último scraping
  const updatedSource = dbRepo.updateNewsSource(source.id, {
    lastScrapedAt: new Date().toISOString(),
    articlesCount: (source.articlesCount || 0) + newCount,
  }) || source;

  dbRepo.appendAuditLog({
    actorId: source.userId,
    actorEmail: 'system',
    actorRole: 'admin',
    action: 'SCRAPING_RUN_SUCCESS',
    category: 'scraping',
    resource: source.url,
    status: 'success',
    ipAddress: '127.0.0.1',
    latencyMs: 120,
    metadata: {
      sourceId: source.id,
      sourceName: source.name,
      found: items.length,
      newCaptured: newCount,
    },
  });

  return {
    source: updatedSource,
    totalFound: items.length,
    newCaptured: newCount,
    articles: capturedList,
  };
}

export async function rewriteArticleWithAi(
  articleId: string,
  options?: Omit<ArticleRewriteOptions, 'articleId'>
): Promise<CapturedArticle> {
  const article = dbRepo.getCapturedArticleById(articleId);
  if (!article) {
    throw new Error(`Artigo com ID ${articleId} não encontrado.`);
  }

  dbRepo.updateCapturedArticle(articleId, { status: 'rewriting' });

  const settings = dbRepo.getSystemSettings();
  let targetSite: any = null;
  if (options?.targetSiteId) {
    targetSite = dbRepo.getWordPressSiteById(options.targetSiteId);
  }

  const tone = options?.tone || targetSite?.aiTone || settings.defaultRewriteTone || 'jornalistico';
  const provider = (options?.provider || settings.aiProvider || 'openrouter') as LLMProviderId;
  const model = options?.model || (provider === 'openrouter' ? settings.openRouterModel : (provider === 'gemini' ? settings.geminiModel : (provider === 'painel-agy' ? (settings.mcpAgyModel || 'gemini-3.8-flash') : settings.llamaModel)));

  // ==========================================================================
  // ROTA ESPECIALIZADA: PAINEL AGY / CLUSTER ANTIGRAVITY (MCP SERVER)
  // Reescrita profunda + Geração de Imagem Inédita Anti-Plágio via SSE (Zero Timeout)
  // ==========================================================================
  if (provider === 'painel-agy') {
    try {
      const mcpResult = await executeMcpAgyRewrite({
        article,
        targetSite,
        tone,
        systemPrompt: settings.aiSystemPrompt,
        mcpUrl: settings.mcpAgyUrl,
        mcpToken: settings.mcpAgyToken,
        mcpModel: model,
        imageStrategy: settings.mcpImageStrategy || 'temporal_advance',
        timeoutSeconds: settings.mcpTimeoutSeconds || 300,
      });

      const articleUpdates: Partial<CapturedArticle> = {
        status: 'ready',
        aiTitle: mcpResult.title,
        aiContent: mcpResult.content,
        aiExcerpt: mcpResult.excerpt,
        aiSeoKeywords: mcpResult.keywords,
      };

      if (mcpResult.newImageUrl) {
        articleUpdates.imageUrl = mcpResult.newImageUrl;
        articleUpdates.mediaData = {
          featuredImage: {
            url: mcpResult.newImageUrl,
            title: mcpResult.imageTitle || mcpResult.title,
            alt: mcpResult.imageAlt || mcpResult.title,
            caption: mcpResult.imageCaption || mcpResult.excerpt,
            base64: mcpResult.imageBase64,
          },
        };
      }

      let updated = dbRepo.updateCapturedArticle(articleId, articleUpdates);
      if (!updated) {
        throw new Error('Falha ao salvar artigo reescrito pelo MCP Painel AGY.');
      }

      if (options?.autoPublish && options?.targetSiteId) {
        await syncArticleToWordPress(articleId, options.targetSiteId);
        updated = dbRepo.getCapturedArticleById(articleId) || updated;
      }

      if (settings.r2AutoSync !== false) {
        try {
          const r2Url = await uploadArticleJson(updated);
          if (r2Url && r2Url !== updated.r2JsonUrl) {
            updated = dbRepo.updateCapturedArticle(articleId, { r2JsonUrl: r2Url }) || updated;
          }
        } catch (r2Err: any) {
          console.warn(`[Scraper] Falha ao atualizar R2 após reescrita MCP do artigo ${articleId}:`, r2Err.message);
        }
      }

      return updated;
    } catch (mcpErr: any) {
      dbRepo.updateCapturedArticle(articleId, {
        status: 'error',
        errorMessage: mcpErr.message || 'Erro na reescrita via MCP Painel AGY',
      });
      throw mcpErr;
    }
  }

  let customSiteInstructions = '';
  if (targetSite?.aiCustomInstructions && targetSite.aiCustomInstructions.trim()) {
    customSiteInstructions = `
======================================================================
[DIRETRIZES EDITORIAIS MANDATÓRIAS DO SITE "${targetSite.siteName}"]:
ATENÇÃO PRIORITÁRIA: Este portal possui regras editoriais exclusivas definidas pelo proprietário do site. Você DEVE seguir CADA UMA DELAS com a mais alta prioridade:
>>> ${targetSite.aiCustomInstructions.trim()} <<<

COMO APLICAR ESSAS DIRETRIZES NO ARTIGO:
- Se solicitar TOM DESCONTRAÍDO, JOVEM OU DINÂMICO: adote um tom leve, engajador e ágil, com estilo de internet conectado ao público leitor.
- Se solicitar RESUMO EM TÓPICOS: inclua obrigatoriamente logo após a introdução uma seção <h2>Resumo da Notícia</h2> ou <h2>Destaques Rápidos</h2> com <ul><li>...</li></ul> resumindo os pontos fundamentais.
- Se solicitar CHAMADA PARA DEBATE NOS COMENTÁRIOS: o artigo DEVE OBRIGATORIAMENTE terminar com um subtítulo (ex: <h2>Participe do Debate</h2> ou <h2>E você, o que achou?</h2>) e parágrafo instigando os leitores a responderem e debaterem na seção de comentários do site.
- Se solicitar FOCO EM SEO ON-PAGE: construa subtítulos semânticos <h2> e <h3> com palavras-chave de cauda longa e termos de busca orgânica.
======================================================================
`;
  }

  let systemPrompt = settings.aiSystemPrompt || `Você é um jornalista sênior, editor-chefe investigativo e especialista em SEO On-Page para WordPress.
Sua missão é transformar a notícia original abaixo em uma reportagem 100% autoral, aprofundada, envolvente e perfeitamente formatada para publicação imediata no portal.

${customSiteInstructions}

[REGRA SUPREMA E INVIOLÁVEL: REESCRITA 100% AUTORAL - ZERO PLÁGIO]
1. É TERMINANTEMENTE PROIBIDO copiar e colar frases, trechos ou períodos literais da matéria original.
2. Você é o autor desta nova reportagem. Reescreva tudo com seu próprio vocabulário jornalístico, estilo, ritmo e estruturação de texto.
3. Mantenha 100% de precisão e fidelidade aos FATOS, NOMES DE PESSOAS, LOCAIS, DATAS, HORÁRIOS, NÚMEROS e DADOS TÉCNICOS.
4. Qualquer ferramenta de detecção de plágio deve atestar 100% de originalidade textual.

[ESTRUTURA TÉCNICA DO ARTIGO]:
1. Formate o corpo do artigo ESTRITAMENTE em HTML limpo, usando <h2>, <h3>, parágrafos <p> ricos e listas <ul><li> quando relevante.
2. Não inclua tags de documento como <html>, <head>, <body> ou <!DOCTYPE>.
3. Crie um Título impactante com alto gatilho de leitura (CTR) sem sensacionalismo falso.
4. Crie um Excerpt / Meta Descrição de até 160 caracteres com excelente gancho editorial.
5. Forneça de 4 a 8 palavras-chave/tags de SEO estratégicas.
6. Forneça o Alt Text (para acessibilidade da imagem), Título SEO e Legenda Jornalística descritiva para a fotografia editorial.

[FORMATO DE SAÍDA OBRIGATÓRIO E REGRAS DE JSON]:
Responda EXCLUSIVAMENTE em formato JSON com a seguinte estrutura:
\`\`\`json
{
  "title": "Título Marcante e Otimizado",
  "content": "<h2>Subtítulo Semântico</h2><p>Parágrafo autoral...</p>",
  "excerpt": "Meta descrição de até 160 caracteres com alto CTR...",
  "keywords": ["tag1", "tag2", "tag3", "tag4"],
  "image_alt": "Texto alternativo descritivo da imagem",
  "image_caption": "Legenda editorial jornalística",
  "image_title": "Título SEO da fotografia"
}
\`\`\`
PROIBIÇÃO ABSOLUTA: NÃO inclua absolutamente NENHUM texto, comentário ou relatório fora do bloco JSON. Todo o conteúdo em "content" deve ser HTML puro.`;

  if (targetSite?.aiCustomInstructions && targetSite.aiCustomInstructions.trim() && !systemPrompt.includes(targetSite.aiCustomInstructions.trim())) {
    systemPrompt += `\n\nDIRETRIZES EDITORIAIS EXCLUSIVAS PARA O SITE "${targetSite.siteName}":\n${targetSite.aiCustomInstructions.trim()}\n(IMPORTANTE: Aplique com prioridade máxima estas diretrizes acima ao recriar o artigo para este site)`;
  }

  const baseContent = (article.cleanText || cleanHtmlTags(article.cleanHtml || '') || article.originalContent || '').slice(0, 4500);

  const userPrompt = `Notícia Original:
Título: ${article.originalTitle}
${article.subtitle ? `Subtítulo: ${article.subtitle}\n` : ''}${article.author ? `Autor: ${article.author}\n` : ''}Link Original: ${article.originalUrl}
Trecho / Conteúdo Base:
${baseContent}

Tom editorial desejado: ${tone}
Por favor, reescreva em português com padrão editorial profissional e otimizado para SEO.`;

  try {
    const aiResult = await executeLlmPrompt({
      provider,
      model,
      prompt: userPrompt,
      systemInstruction: systemPrompt,
    });

    // Escudo Anti-Erro: Garante que falhas de API nunca sejam publicadas como matérias
    if (!aiResult.liveApiUsed || aiResult.output.includes('[Gemini Error') || aiResult.output.includes('Falha ao comunicar com a API')) {
      throw new Error(`Falha na IA (${provider}): ${aiResult.output}`);
    }

    const parsed = parseRobustArticleJson(aiResult.output, article);

    const articleUpdates: Partial<CapturedArticle> = {
      status: 'ready',
      aiTitle: parsed.title || article.originalTitle,
      aiContent: sanitizeArticleHtmlForPublish(parsed.content || article.originalContent),
      aiExcerpt: parsed.excerpt || article.originalExcerpt,
      aiSeoKeywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };

    // Resolução de Imagem: Se a original não existe ou é inválida/proibida, gera via Google Imagen 3 / Host Dedicado
    let finalImageUrl: string | undefined = undefined;
    let finalBase64: string | undefined = undefined;

    if (article.imageUrl && !isForbiddenImageService(article.imageUrl)) {
      finalImageUrl = article.imageUrl;
    } else {
      console.log(`[Scraper AI] Artigo "${parsed.title || article.originalTitle}" sem foto. Solicitando geração editorial via Google Imagen 3...`);
      try {
        const generated = await generateContextualEditorialImage(parsed.title || article.originalTitle, articleId);
        if (generated && !isForbiddenImageService(generated.url)) {
          finalImageUrl = generated.url;
          finalBase64 = generated.base64;
        }
      } catch (imgErr: any) {
        console.warn(`[Scraper AI] Falha ao gerar imagem contextual: ${imgErr.message}. Publicando sem imagem.`);
      }
    }

    if (finalImageUrl) {
      articleUpdates.imageUrl = finalImageUrl;
      articleUpdates.mediaData = {
        featuredImage: {
          url: finalImageUrl,
          title: parsed.image_title || parsed.title || article.originalTitle,
          alt: parsed.image_alt || parsed.title || article.originalTitle,
          caption: parsed.image_caption || parsed.excerpt || '',
          base64: finalBase64,
        },
      };
    }

    let updated = dbRepo.updateCapturedArticle(articleId, articleUpdates);

    if (!updated) {
      throw new Error('Falha ao salvar artigo reescrito.');
    }

    // Se autoPublish estiver ativado e houver um site de destino
    if (options?.autoPublish && options?.targetSiteId) {
      await syncArticleToWordPress(articleId, options.targetSiteId);
      // Recarrega o artigo atualizado com os links do WordPress
      updated = dbRepo.getCapturedArticleById(articleId) || updated;
    }

    // Sincroniza artigo reescrito com o Cloudflare R2
    if (settings.r2AutoSync !== false) {
      try {
        const r2Url = await uploadArticleJson(updated);
        if (r2Url && r2Url !== updated.r2JsonUrl) {
          updated = dbRepo.updateCapturedArticle(articleId, { r2JsonUrl: r2Url }) || updated;
        }
      } catch (r2Err: any) {
        console.warn(`[Scraper] Falha ao atualizar R2 após reescrita do artigo ${articleId}:`, r2Err.message);
      }
    }

    return updated;
  } catch (error: any) {
    dbRepo.updateCapturedArticle(articleId, {
      status: 'error',
      errorMessage: error.message || 'Erro na geração de IA',
    });
    throw error;
  }
}

/**
 * Força a sincronização de um artigo com o Cloudflare R2
 */
export async function syncArticleToR2(articleId: string): Promise<string | null> {
  const article = dbRepo.getCapturedArticleById(articleId);
  if (!article) {
    throw new Error(`Artigo com ID ${articleId} não encontrado.`);
  }
  const r2Url = await uploadArticleJson(article);
  if (r2Url) {
    dbRepo.updateCapturedArticle(articleId, { r2JsonUrl: r2Url });
  }
  return r2Url;
}

/**
 * Sincroniza todos os artigos capturados para o Cloudflare R2
 */
export async function syncAllArticlesToR2(): Promise<{ total: number; synced: number; feedsSynced: boolean }> {
  const articles = dbRepo.getCapturedArticles({ limit: 2000 });
  let synced = 0;

  for (const art of articles) {
    try {
      const url = await uploadArticleJson(art);
      if (url) {
        dbRepo.updateCapturedArticle(art.id, { r2JsonUrl: url });
        synced++;
      }
    } catch (e: any) {
      console.warn(`[R2 Sync All] Falha no artigo ${art.id}:`, e.message);
    }
  }

  let feedsSynced = false;
  try {
    const feedResult = await uploadFeedJson(articles);
    feedsSynced = Boolean(feedResult);
  } catch (feedErr: any) {
    console.warn('[R2 Sync All] Falha ao sincronizar feeds:', feedErr.message);
  }

  return { total: articles.length, synced, feedsSynced };
}

/**
 * Atualiza feeds agregados particionados por fuso de Recife no Cloudflare R2
 */
export async function syncFeedsToR2(): Promise<any> {
  const articles = dbRepo.getCapturedArticles({ limit: 200 });
  return await uploadFeedJson(articles);
}
