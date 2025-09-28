import sanitizeHtml from 'sanitize-html'

export const cleanHtml=(checkedText:string)=>sanitizeHtml(checkedText,{
     allowedTags: ['p', 'a'], // разрешённые теги
     allowedAttributes: {
       a: ['href'] // разрешённые атрибуты для тега <a>
     },
      transformTags: {
    'a': (tagName, attribs) => {
      const attrs = { ...attribs, rel: 'noopener noreferrer nofollow' };
      return ({ tagName:'a', attribs: attrs });
    }
  }
})
