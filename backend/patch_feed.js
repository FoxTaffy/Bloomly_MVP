const fs = require('fs');
const file = '/var/www/bloomly/frontend/src/components/MainLayout.vue';
let content = fs.readFileSync(file, 'utf8');

const replacement = `const currentPage = ref(1)
const isFetchingMore = ref(false)
const hasMorePosts = ref(true)

const fetchPosts = async (loadMore = false) => {
  if (loadMore) {
    if (isFetchingMore.value || !hasMorePosts.value) return;
    isFetchingMore.value = true;
    currentPage.value++;
  } else {
    isLoadingPosts.value = true;
    currentPage.value = 1;
    hasMorePosts.value = true;
  }

  try {
    let loadedPosts: any[] = []
    if (feedMode.value === 'for-you') {
      const params = new URLSearchParams()
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(\`/posts/personalized?\${params.toString()}\`)
      if (res.data.success) { if(!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'subscriptions') {
      const params = new URLSearchParams()
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(\`/follows/feed?\${params.toString()}\`)
      if (res.data.success) { if(!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'trending') {
      const params = new URLSearchParams()
      params.append('sort', 'hot')
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      if (selectedTag.value) params.append('tag', selectedTag.value)
      const res = await api.get(\`/posts?\${params.toString()}\`)
      if (res.data.success) { if(!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'news') {
      const params = new URLSearchParams()
      params.append('sort', 'new')
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      if (selectedTag.value) params.append('tag', selectedTag.value)
      const res = await api.get(\`/posts?\${params.toString()}\`)
      if (res.data.success) { if(!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'photos') {
      const params = new URLSearchParams()
      params.append('hasMedia', 'true')
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(\`/posts?\${params.toString()}\`)
      if (res.data.success) { if(!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'nsfw') {
      const res = await api.get(\`/posts?safeMode=false&page=\${currentPage.value}\`)
      if (res.data.success) { if(!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else {
      // fallback: general posts
      const params = new URLSearchParams()
      if (searchQuery.value) params.append('search', searchQuery.value)
      if (selectedCategory.value) params.append('category', selectedCategory.value)
      if (selectedTag.value) params.append('tag', selectedTag.value)
      params.append('page', currentPage.value.toString())
      params.append('sort', sortBy.value)
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(\`/posts?\${params.toString()}\`)
      if (res.data.success) { if(!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    }
    
    if (loadedPosts.length === 0) {
      hasMorePosts.value = false;
    } else {
      if (loadMore) {
        posts.value = [...posts.value, ...loadedPosts];
      } else {
        posts.value = loadedPosts;
      }
      initPostStatus(loadedPosts)
      fetchFollowStatusForPosts(loadedPosts)
    }
  } catch (e) {
    console.error('Failed to fetch posts', e)
  } finally {
    isLoadingPosts.value = false;
    isFetchingMore.value = false;
  }
}

// Global infinite scroll listener
const handleScroll = () => {
  const bottomOfWindow = document.documentElement.scrollTop + window.innerHeight >= document.documentElement.offsetHeight - 200;
  if (bottomOfWindow && !isLoadingPosts.value && !isFetchingMore.value && hasMorePosts.value) {
    fetchPosts(true);
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll);
});
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});`;

content = content.replace(/const fetchPosts = async \(\) => \{[\s\S]*?(?=\nconst selectedTag)/, replacement);

fs.writeFileSync(file, content);
console.log('patched');
