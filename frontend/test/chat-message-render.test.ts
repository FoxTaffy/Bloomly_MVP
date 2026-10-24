import { describe, it, expect } from 'vitest'
import { renderMentions } from '../src/lib/chatMessage'

describe('renderMentions: текст сообщения в безопасный HTML', () => {
  it('экранирует HTML и подсвечивает @ник', () => {
    const html = renderMentions('<script>alert(1)</script> привет @fox')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('data-username="fox">@fox</span>')
  })

  it('ссылка кликабельна, точка в конце не входит в ссылку', () => {
    const html = renderMentions('см https://bloomly.fun/help.')
    expect(html).toContain('<a href="https://bloomly.fun/help" target="_blank" rel="noopener noreferrer nofollow ugc"')
    expect(html.endsWith('</a>.')).toBe(true)
  })

  it('кавычки и & в адресе экранированы, @ внутри ссылки — не упоминание', () => {
    const html = renderMentions('https://x.com/@user?a=1&b="2"x')
    expect(html).toContain('href="https://x.com/@user?a=1&amp;b=&quot;2&quot;x"')
    expect(html).not.toContain('mention-link')
  })

  it('javascript: и прочие схемы ссылками не становятся', () => {
    expect(renderMentions('javascript:alert(1)')).not.toContain('<a ')
    expect(renderMentions('e-mail a@b.ru')).not.toContain('<a ')
  })
})
