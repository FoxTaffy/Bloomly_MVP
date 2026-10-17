// The fields of a post that screens read directly. The API returns more (author, counters,
// votes…); those are passed through untouched to PostCard, hence the index signature.
export interface PostGroupContext { id: string; slug: string; name: string; avatar_url: string | null; accent_color?: string | null }

export interface Post {
  can_view_content?: boolean
  id: string
  content?: string
  media_urls: string[]
  created_at: string
  is_nsfw?: boolean
  tags?: Array<{ name?: string; tag?: { name: string } }>
  groupPosts?: Array<{ group: PostGroupContext }>
  [key: string]: unknown
}
