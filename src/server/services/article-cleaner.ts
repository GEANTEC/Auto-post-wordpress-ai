import { CapturedArticle } from '../../shared/types';

export interface RobustParsedArticle {
  title: string;
  content: string;
  excerpt: string;
  keywords: string[];
  image_url?: string;
  image_alt?: string;
  image_caption?: string;
  image_title?: string;
}

/**
 * Sanitiza o HTML do artigo antes de salvar ou publicar no WordPress,
 * garantindo a remoção completa de resquícios de JSON, metadados,
 * relatórios de conformidade e notas de implementação da IA.
 */
export function sanitizeArticleHtmlForPublish(html: string): string {
  if (!html) return '';
  let cleaned = html;

  // 1. Remove qualquer cauda vazada de JSON (ex: ", \n "excerpt": ... ou "keywords": ... ou "image_url": ...)
  cleaned = cleaned.replace(
    /["”']\s*,\s*["”'](?:excerpt|keywords|image_url|image_alt|image_caption|image_title)["”'][\s\S]*/i,
    ''
  );

  // 2. Remove fechamento de JSON vazado seguido de relatórios
  cleaned = cleaned.replace(
    /\s*\}\s*(?:[\*\-#\s]*)*(?:Relatório|Diretrizes|Reescrita Autoral|Notas)[\s\S]*/i,
    ''
  );

  // 3. Remove blocos de Relatório de Implementação / Diretrizes Editoriais / Originalidade
  cleaned = cleaned.replace(
    /(?:<p>)?\s*(?:[\*\-#\s]*)*(?:##\s*)?(?:Relatório de Implementação|Diretrizes Editoriais|Reescrita Autoral e Originalidade|Notas do Editor|Notas de Originalidade)[\s\S]*/i,
    ''
  );

  // 4. Remove blocos de fechamento de markdown que sobraram (``` ou ```html ou ```json)
  cleaned = cleaned.replace(/```(?:html|json)?[\s\S]*/gi, '');

  // 5. Remove chaves soltas no final de JSON
  cleaned = cleaned.replace(/\s*\}\s*$/g, '');

  // 6. Remove aspas soltas no final que fechavam propriedades JSON
  cleaned = cleaned.replace(/["”']\s*$/g, '');

  // 7. Se sobrou início de JSON acidental (ex: { "title": ... "content": ")
  cleaned = cleaned.replace(/^\s*\{[\s\S]*?["”']content["”']\s*:\s*["”']/i, '');

  // 8. Se o conteúdo não possui tags HTML (nenhum <p>, <h2>, <h3>, <ul>), envolve quebras de linha em <p>
  if (!/<(?:p|h2|h3|h4|ul|ol|li|blockquote|div)[\s>]/i.test(cleaned)) {
    const paragraphs = cleaned
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (paragraphs.length > 0) {
      cleaned = paragraphs.map((p) => `<p>${p}</p>`).join('\n');
    }
  }

  return cleaned.trim();
}

/**
 * Parser resiliente para extrair artigos do retorno do LLM ou MCP Antigravity.
 * Trata:
 * - Aspas curvas / smart quotes (“ e ”)
 * - Quebras de linha literais dentro de strings JSON
 * - Trailing commas
 * - Comentários ou relatórios de implementação adicionados após o JSON
 * - Extração por Regex individual caso o JSON esteja quebrado por aspas internas
 */
export function parseRobustArticleJson(
  rawText: string,
  fallbackArticle: Partial<CapturedArticle> = {}
): RobustParsedArticle {
  const defaultTitle = fallbackArticle.aiTitle || fallbackArticle.originalTitle || 'Notícia Atualizada';
  const defaultContent = fallbackArticle.originalContent || fallbackArticle.cleanHtml || '';
  const defaultExcerpt = fallbackArticle.originalExcerpt || '';
  const defaultKeywords =
    fallbackArticle.aiSeoKeywords && fallbackArticle.aiSeoKeywords.length > 0
      ? fallbackArticle.aiSeoKeywords
      : ['noticias', 'atualidades'];

  if (!rawText || !rawText.trim()) {
    return {
      title: defaultTitle,
      content: sanitizeArticleHtmlForPublish(defaultContent),
      excerpt: defaultExcerpt,
      keywords: defaultKeywords,
    };
  }

  // 1. Normaliza aspas curvas (curly quotes) que quebram o JSON parser
  let normalized = rawText
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  // 2. Remove qualquer relatório ou nota adicionada após o JSON
  normalized = normalized.replace(
    /(?:```\s*)?[\*\-#\s]*(?:##\s*)?(?:Relatório de Implementação|Diretrizes Editoriais|Reescrita Autoral|Notas do Editor)[\s\S]*$/i,
    ''
  );

  // 3. Tentar extrair bloco ```json ... ``` ou entre o primeiro { e o último }
  let candidate = '';
  const blockMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (blockMatch) {
    candidate = blockMatch[1].trim();
  } else {
    const firstBrace = normalized.indexOf('{');
    const lastBrace = normalized.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      candidate = normalized.slice(firstBrace, lastBrace + 1).trim();
    } else {
      candidate = normalized.trim();
    }
  }

  // Tentativa 1: JSON.parse direto
  try {
    const obj = JSON.parse(candidate);
    if (obj && (obj.title || obj.content)) {
      return {
        title: (obj.title || defaultTitle).trim(),
        content: sanitizeArticleHtmlForPublish(obj.content || defaultContent),
        excerpt: (obj.excerpt || defaultExcerpt).slice(0, 300).trim(),
        keywords: Array.isArray(obj.keywords) && obj.keywords.length > 0 ? obj.keywords : defaultKeywords,
        image_url: obj.image_url ? String(obj.image_url).trim() : undefined,
        image_alt: obj.image_alt ? String(obj.image_alt).trim() : undefined,
        image_caption: obj.image_caption ? String(obj.image_caption).trim() : undefined,
        image_title: obj.image_title ? String(obj.image_title).trim() : undefined,
      };
    }
  } catch {
    // Tentativa 2: Tratar quebras de linha literais dentro de strings e trailing commas
    try {
      let fixed = candidate.replace(/,\s*([}\]])/g, '$1');
      // Escapa quebras de linha cruas dentro de propriedades de string
      fixed = fixed.replace(/(?<=:\s*"[^"]*)\r?\n(?=[^"]*")/g, '\\n');
      const obj = JSON.parse(fixed);
      if (obj && (obj.title || obj.content)) {
        return {
          title: (obj.title || defaultTitle).trim(),
          content: sanitizeArticleHtmlForPublish(obj.content || defaultContent),
          excerpt: (obj.excerpt || defaultExcerpt).slice(0, 300).trim(),
          keywords: Array.isArray(obj.keywords) && obj.keywords.length > 0 ? obj.keywords : defaultKeywords,
          image_url: obj.image_url ? String(obj.image_url).trim() : undefined,
          image_alt: obj.image_alt ? String(obj.image_alt).trim() : undefined,
          image_caption: obj.image_caption ? String(obj.image_caption).trim() : undefined,
          image_title: obj.image_title ? String(obj.image_title).trim() : undefined,
        };
      }
    } catch {
      // Falhou; prossegue para extração granular via Regex
    }
  }

  // Tentativa 3: Extração granular por Regex (independente de erros de sintaxe no restante do JSON)
  // Extrair Título
  let title = defaultTitle;
  const titleMatch = candidate.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*?)"/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/\\"/g, '"').trim();
  }

  // Extrair Excerpt
  let excerpt = defaultExcerpt;
  const excerptMatch = candidate.match(/"excerpt"\s*:\s*"((?:[^"\\]|\\.)*?)"/i);
  if (excerptMatch && excerptMatch[1]) {
    excerpt = excerptMatch[1].replace(/\\"/g, '"').trim();
  }

  // Extrair Keywords
  let keywords = defaultKeywords;
  const kwMatch = candidate.match(/"keywords"\s*:\s*\[([\s\S]*?)\]/i);
  if (kwMatch && kwMatch[1]) {
    const rawItems = [...kwMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (rawItems.length > 0) keywords = rawItems;
  }

  // Extrair Imagens
  const imgUrlMatch = candidate.match(/"image_url"\s*:\s*"([^"]*?)"/i);
  const imgAltMatch = candidate.match(/"image_alt"\s*:\s*"([^"]*?)"/i);
  const imgCapMatch = candidate.match(/"image_caption"\s*:\s*"([^"]*?)"/i);
  const imgTitleMatch = candidate.match(/"image_title"\s*:\s*"([^"]*?)"/i);

  // Extrair Content (recortando entre "content": " e o próximo campo ou término)
  let content = '';
  const contentIdx = candidate.search(/"content"\s*:\s*"/i);
  if (contentIdx !== -1) {
    const startPos = candidate.indexOf('"', contentIdx + 9) + 1;
    const rest = candidate.slice(startPos);
    const endMatch = rest.match(/["”']\s*,\s*["”'](?:excerpt|keywords|image_url|image_alt|image_caption|image_title)["”']/i);
    if (endMatch && endMatch.index !== undefined) {
      content = rest.slice(0, endMatch.index);
    } else {
      const lastQuote = rest.lastIndexOf('"');
      content = lastQuote !== -1 ? rest.slice(0, lastQuote) : rest;
    }
  }

  if (content.trim()) {
    content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    content = sanitizeArticleHtmlForPublish(content);
  } else {
    // Fallback limpo: se não conseguiu extrair content por regex, sanitiza o candidate
    content = sanitizeArticleHtmlForPublish(candidate);
    if (!content || content.includes('"excerpt":') || content.includes('[Gemini Error') || content.includes('Falha ao comunicar com a API') || content.length < 50) {
      content = sanitizeArticleHtmlForPublish(defaultContent);
    }
  }

  return {
    title,
    content,
    excerpt,
    keywords,
    image_url: imgUrlMatch ? imgUrlMatch[1].trim() : undefined,
    image_alt: imgAltMatch ? imgAltMatch[1].trim() : undefined,
    image_caption: imgCapMatch ? imgCapMatch[1].trim() : undefined,
    image_title: imgTitleMatch ? imgTitleMatch[1].trim() : undefined,
  };
}
