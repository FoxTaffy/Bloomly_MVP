<template>
    <AppHeader :show-back="true" v-model:nsfwMode="nsfwMode" />

    <!-- ─── Page background (profile_bg_url) ──────────────────────────────── -->
    <template v-if="(viewedProfile as any)?.profile_bg_url">
      <div class="fixed inset-0 z-[-1] pointer-events-none"
        :style="`background-image: url('${(viewedProfile as any).profile_bg_url}'); background-size: cover; background-position: center; background-attachment: fixed;`" />
      <div class="fixed inset-0 z-[-1] pointer-events-none" style="background: rgba(22,25,47,0.78)" />
    </template>

    <!-- ─── hidden file inputs for banner/avatar S3 upload ────────────────── -->
    <input ref="bannerFileInput" type="file" accept="image/*" class="sr-only" @change="onBannerFileChange" />
    <input ref="avatarFileInput" type="file" accept="image/*" class="sr-only" @change="onAvatarFileChange" />

    <!-- ─── Edit Profile Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showEditModal" class="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" @click.self="showEditModal = false">
        <div class="w-full max-w-lg bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between px-6 py-4 border-b border-brand-border sticky top-0 bg-brand-card z-10">
            <h3 class="font-bold text-white text-lg">
              {{ editSection === 'bio' ? 'О себе' : editSection === 'fursona' ? 'Фурсона' : editSection === 'fursuit' ? 'Фурсьют' : editSection === 'contacts' ? 'Контакты' : editSection === 'basics' ? 'Основное' : editSection === 'socials' ? 'Соцсети' : 'Изменить профиль' }}
            </h3>
            <button @click="showEditModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>

          <div class="p-6 space-y-4">
            <!-- Basics: display_name, pronouns, job_title -->
            <template v-if="editSection === 'basics'">
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5">Имя</label>
                <input v-model="editForm.display_name" type="text" maxlength="50" placeholder="Отображаемое имя"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5">Местоимения</label>
                <input v-model="editForm.pronouns" type="text" maxlength="30" placeholder="он/его, она/её, они/их…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5">Должность / специализация</label>
                <input v-model="editForm.job_title" type="text" maxlength="80" placeholder="Художник, Программист…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div v-if="!(viewedProfile as any)?.is_verified">
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5">Творчество с (дата)</label>
                <input v-model="editForm.artist_since" type="date" :max="todayISO"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
                <p class="text-[10px] text-white/40 mt-1">Определяет ваш значок стажа художника</p>
              </div>
            </template>

            <!-- Bio -->
            <template v-if="editSection === 'bio'">
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5">О себе</label>
                <textarea v-model="editForm.bio" rows="5" maxlength="300" placeholder="Расскажи о себе…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all resize-none"></textarea>
                <p class="text-[11px] text-white/55 mt-1 text-right">{{ (editForm.bio ?? '').length }}/300</p>
              </div>
            </template>

            <!-- Fursona -->
            <template v-if="editSection === 'fursona'">
              <!-- Hero banner -->
              <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-accent/20 via-purple-500/10 to-pink-500/10 border border-brand-accent/20 p-5 mb-1">
                <div class="absolute top-0 right-0 w-32 h-32 bg-brand-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div class="flex items-center gap-3 relative z-10">
                  <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-accent to-purple-500 flex items-center justify-center shadow-lg shadow-brand-accent/25">
                    <BIcon name="PawPrint" class="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 class="text-sm font-extrabold text-white">Твоя фурсона</h4>
                    <p class="text-[11px] text-white/50 mt-0.5">Расскажи о своём персонаже — заполни все поля</p>
                  </div>
                </div>
              </div>

              <!-- Имя и вид -->
              <div class="p-4 bg-gradient-to-br from-brand-bg/80 to-brand-card/40 border border-brand-border/60 rounded-2xl space-y-3">
                <p class="text-xs font-bold text-brand-accent uppercase tracking-wider flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded-md bg-brand-accent/15 flex items-center justify-center text-[10px] font-black text-brand-accent">1</span>
                  Основная информация
                </p>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-white/55 mb-1.5">Имя персонажа</label>
                    <input v-model="editForm.fursona_name" type="text" maxlength="80" placeholder="Как зовут фурсону…"
                      class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-white/55 mb-1.5">Вид / порода</label>
                    <input v-model="editForm.persona" type="text" placeholder="Волк, Дракон, Лис…"
                      class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-white/55 mb-1.5">Пол персонажа</label>
                    <select v-model="editForm.fursona_gender"
                      class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all appearance-none">
                      <option value="">Не указан</option>
                      <option value="male">Мужской</option>
                      <option value="female">Женский</option>
                      <option value="nonbinary">Небинарный</option>
                      <option value="androgynous">Андрогин</option>
                      <option value="other">Другой</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-white/55 mb-1.5">Цвет</label>
                    <div class="flex items-center gap-2">
                      <input v-model="editForm.fursona_color" type="color"
                        class="w-10 h-10 rounded-xl border border-brand-border cursor-pointer bg-transparent p-0.5" />
                      <input v-model="editForm.fursona_color" type="text" maxlength="20" placeholder="#A855F7"
                        class="flex-1 bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Описание / особенности -->
              <div class="p-4 bg-gradient-to-br from-brand-bg/80 to-brand-card/40 border border-brand-border/60 rounded-2xl space-y-3">
                <p class="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded-md bg-purple-500/15 flex items-center justify-center text-[10px] font-black text-purple-400">2</span>
                  Особенности и характер
                </p>
                <div>
                  <label class="block text-xs font-semibold text-white/55 mb-1.5">Описание / особенности</label>
                  <textarea v-model="editForm.fursona_description" rows="4" maxlength="500"
                    placeholder="Опиши внешность, характер, историю… Всё, что делает персонажа уникальным."
                    class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all resize-none leading-relaxed"></textarea>
                  <p class="text-[11px] text-white/40 mt-1 text-right">{{ (editForm.fursona_description ?? '').length }}/500</p>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-white/55 mb-1.5">Любит</label>
                    <input :value="editForm.likes?.join(', ')" @input="editForm.likes = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)"
                      type="text" placeholder="Музыка, Горы…"
                      class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-white/55 mb-1.5">Не любит</label>
                    <input :value="editForm.dislikes?.join(', ')" @input="editForm.dislikes = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)"
                      type="text" placeholder="Шум, Понедельник…"
                      class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
                  </div>
                </div>
              </div>

              <!-- Реф-лист -->
              <div class="p-4 bg-gradient-to-br from-brand-bg/80 to-brand-card/40 border border-brand-border/60 rounded-2xl space-y-3">
                <p class="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded-md bg-pink-500/15 flex items-center justify-center text-[10px] font-black text-pink-400">3</span>
                  Реф-лист
                </p>
                <input ref="fursonaRefInput" type="file" accept="image/*" class="sr-only" @change="onFursonaRefUpload" />
                <div v-if="editForm.fursona_photo_url" class="relative group/ref rounded-xl overflow-hidden border border-brand-border">
                  <img :src="editForm.fursona_photo_url" class="w-full max-h-48 object-cover" />
                  <div class="absolute inset-0 bg-black/50 opacity-0 group-hover/ref:opacity-100 transition-all flex items-center justify-center gap-3">
                    <button type="button" @click="(fursonaRefInput as any)?.click()" class="px-3 py-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-lg text-xs font-bold text-white transition-all">
                      <BIcon name="RefreshCw" class="w-3 h-3 inline mr-1" />Заменить
                    </button>
                    <button type="button" @click="editForm.fursona_photo_url = ''" class="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 backdrop-blur-sm rounded-lg text-xs font-bold text-rose-300 transition-all">
                      <BIcon name="Trash2" class="w-3 h-3 inline mr-1" />Удалить
                    </button>
                  </div>
                </div>
                <button v-else type="button" @click="(fursonaRefInput as any)?.click()" :disabled="isUploadingRef"
                  class="w-full py-6 border-2 border-dashed border-brand-border/60 hover:border-brand-accent/40 rounded-xl flex flex-col items-center gap-2 transition-all group/upload cursor-pointer">
                  <div class="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center group-hover/upload:scale-105 transition-transform">
                    <span v-if="isUploadingRef" class="w-5 h-5 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
                    <BIcon v-else name="Image" class="w-6 h-6 text-pink-400" />
                  </div>
                  <p class="text-xs font-bold text-white/55 group-hover/upload:text-white transition-colors">Загрузить реф-лист</p>
                  <p class="text-[10px] text-white/35">PNG, JPG до 10 МБ</p>
                </button>
              </div>
            </template>

            <!-- Fursuit -->
            <template v-if="editSection === 'fursuit'">
              <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl space-y-4">
                <div class="flex items-center justify-between">
                  <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
                    <span class="text-base">🐾</span> Показывать вкладку «Фурсьют»
                  </p>
                  <button type="button" @click="editForm.has_fursuit = !editForm.has_fursuit"
                    class="relative w-11 h-6 rounded-full border transition-all flex-shrink-0"
                    :class="editForm.has_fursuit ? 'bg-brand-accent/20 border-brand-accent/60' : 'bg-brand-bg border-brand-border'">
                    <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-all"
                      :class="editForm.has_fursuit ? 'translate-x-5 bg-brand-accent' : 'translate-x-0 bg-white/40'"></span>
                  </button>
                </div>

                <div v-if="editForm.has_fursuit" class="space-y-3">
                  <div>
                    <label class="block text-xs font-semibold text-white/55 mb-1">Описание фурсьюта</label>
                    <textarea v-model="editForm.fursuit_description"
                      placeholder="Расскажи о своём фурсьюте…"
                      class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all resize-none"
                      rows="4" maxlength="300"></textarea>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-white/55 mb-1">Мастер (изготовитель)</label>
                    <input v-model="editForm.fursuit_maker" type="text"
                      placeholder="Имя или ник мастера…"
                      class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all"
                      maxlength="200" />
                  </div>
                </div>
              </div>
            </template>

            <!-- Contacts -->
            <template v-if="editSection === 'contacts'">
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5">Город</label>
                <input v-model="editForm.location" type="text" maxlength="100" placeholder="Москва, Санкт-Петербург…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5">Страна</label>
                <input v-model="editForm.country" type="text" maxlength="80" placeholder="Россия, Германия…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5">Сайт</label>
                <input v-model="editForm.website" type="url" placeholder="https://…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5">Статус отношений</label>
                <select v-model="editForm.relationship_status"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-accent transition-all">
                  <option value="">Не указано</option>
                  <option value="single">Свободен/а</option>
                  <option value="in_relationship">В отношениях</option>
                  <option value="married">В браке</option>
                  <option value="complicated">Всё сложно</option>
                  <option value="open">Открытые отношения</option>
                  <option value="looking">В поиске</option>
                </select>
              </div>
            </template>

            <!-- Socials -->
            <template v-if="editSection === 'socials'">
              <p class="text-xs text-white/35">Укажи username или полную ссылку</p>
              <div v-for="net in socialNetworks" :key="net.key" class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border border-brand-border"
                  :style="{ backgroundColor: net.color + '22', borderColor: net.color + '55' }">
                  <BIcon :name="net.iconName" class="w-4 h-4" :style="{ color: net.color }" />
                </div>
                <div class="flex-1">
                  <label class="block text-[11px] font-semibold text-white/55 mb-1">{{ net.label }}</label>
                  <input :value="editForm.social_links?.[net.key] ?? ''"
                    @input="editForm.social_links = { ...(editForm.social_links ?? {}), [net.key]: ($event.target as HTMLInputElement).value }"
                    type="text" :placeholder="net.key === 'telegram' ? '@username' : net.key === 'discord' ? 'username#0000' : net.key === 'other' ? 'https://example.com' : '@username'"
                    class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white placeholder-brand-muted/50 focus:outline-none focus:border-brand-accent transition-all" />
                </div>
              </div>
            </template>

            <button @click="saveEditModal" :disabled="isSavingEdit"
              class="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-sm">
              <span v-if="isSavingEdit" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Badges Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showBadgesModal" class="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" @click.self="showBadgesModal = false">
        <div class="w-full max-w-md bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto">
          <div class="flex items-center justify-between px-6 py-4 border-b border-brand-border sticky top-0 bg-brand-card z-10">
            <div class="flex items-center gap-2.5">
              <BIcon name="Award" class="w-5 h-5 text-yellow-400" />
              <h3 class="font-bold text-white text-lg">Значки</h3>
              <span class="text-xs font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ achievementBadges.length }}</span>
            </div>
            <button @click="showBadgesModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="p-4 grid grid-cols-1 gap-3">
            <div v-for="badge in achievementBadges" :key="badge.key"
              class="flex items-center gap-4 p-4 rounded-2xl bg-brand-bg border border-brand-border hover:border-brand-accent/30 transition-all group">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105" :class="badge.iconBg">
                <component :is="badge.iconComp" class="w-7 h-7" :class="badge.iconColor" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-extrabold text-white leading-tight">{{ badge.label }}</p>
                <p class="text-xs text-white/55 mt-0.5">{{ badge.desc }}</p>
              </div>
            </div>
            <div v-if="!achievementBadges.length" class="py-10 text-center text-white/35 text-sm">Пока нет значков</div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Wallet Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showWalletModal" class="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" @click.self="showWalletModal = false">
        <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between px-6 py-4 border-b border-brand-border">
            <div class="flex items-center gap-2.5">
              <BIcon name="Wallet" class="w-5 h-5 text-brand-accent" />
              <h3 class="font-bold text-white text-lg">Кошелёк</h3>
            </div>
            <button @click="showWalletModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="p-6 space-y-4">
            <!-- Balance hero -->
            <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-accent/20 to-brand-accent-plus/20 border border-brand-accent/25 p-6 text-center">
              <div class="absolute inset-0 opacity-5" style="background-image:radial-gradient(circle at 30% 50%, #4C67CF 0%, transparent 60%), radial-gradient(circle at 70% 50%, #31458F 0%, transparent 60%)" />
              <p class="text-xs font-bold text-brand-accent uppercase tracking-widest mb-2 relative">Баланс</p>
              <p class="text-4xl font-extrabold text-white leading-none relative">
                {{ Number((viewedProfile as any)?.wallet?.balance ?? 0).toFixed(2) }}
              </p>
              <p class="text-sm text-brand-accent-minus font-semibold mt-1 relative">🌸 Blooms</p>
            </div>
            <!-- Action buttons -->
            <div class="grid grid-cols-2 gap-3">
              <button disabled class="flex flex-col items-center gap-1.5 p-4 rounded-2xl border border-brand-border bg-brand-bg/50 opacity-50 cursor-not-allowed">
                <BIcon name="Plus" class="w-5 h-5 text-brand-accent" />
                <span class="text-xs font-bold text-white">Пополнить</span>
              </button>
              <button disabled class="flex flex-col items-center gap-1.5 p-4 rounded-2xl border border-brand-border bg-brand-bg/50 opacity-50 cursor-not-allowed">
                <BIcon name="ArrowUpRight" class="w-5 h-5 text-white/55" />
                <span class="text-xs font-bold text-white/55">Вывести</span>
              </button>
            </div>
            <p class="text-center text-[11px] text-white/35">Транзакции и история скоро появятся</p>
          </div>
        </div>
      </div>
    </Transition>

    <div class="max-w-7xl mx-auto flex pt-16 md:pt-24 px-3 md:px-4 gap-4 md:gap-8 relative z-[1]">

      <!-- ─── Left Sidebar ──────────────────────────────────────── -->
      <AppSidebar>
        <template v-if="viewedProfile" #extra>
          <div>
            <h4 class="px-4 text-xs font-bold text-white/55 mb-2 uppercase tracking-wider">О профиле</h4>
            <nav class="space-y-1">
              <button v-for="nav in aboutNavs" :key="nav.key"
                @click="aboutTab = nav.key"
                class="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-left group"
                :class="aboutTab === nav.key ? 'bg-brand-accent/20 text-brand-accent' : 'text-white/55 hover:bg-brand-card/50 hover:text-white'">
                <component :is="nav.icon" class="w-5 h-5 flex-shrink-0" />
                <span>{{ nav.label }}</span>
              </button>
            </nav>
          </div>
        </template>
      </AppSidebar>

      <!-- ─── Main ─────────────────────────────────────────────────────── -->
      <main class="flex-1 min-w-0 pb-28 md:pb-20 min-h-screen">

        <!-- Loading -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center gap-4 py-32">
          <div class="w-12 h-12 border-[3px] border-brand-accent border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-white/55 font-semibold">Загрузка профиля…</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="mt-8 bg-brand-card border border-brand-error/20 rounded-3xl p-10 text-center shadow-xl">
          <div class="w-16 h-16 rounded-2xl bg-brand-error/10 flex items-center justify-center mx-auto mb-4">
            <BIcon name="AlertCircle" class="w-8 h-8 text-brand-error" />
          </div>
          <p class="text-brand-error font-bold text-lg mb-2">Ошибка загрузки</p>
          <p class="text-white/55 text-sm mb-6">{{ error }}</p>
          <button @click="loadProfile" class="px-6 py-2.5 bg-brand-accent hover:bg-brand-accent-plus rounded-xl text-sm font-bold transition-all">Повторить</button>
        </div>

        <!-- Not found -->
        <div v-else-if="!viewedProfile" class="mt-8 bg-brand-card border border-brand-border rounded-3xl p-12 text-center shadow-xl">
          <div class="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mx-auto mb-4">
            <BIcon name="UserX" class="w-8 h-8 text-white/55" />
          </div>
          <p class="text-white font-bold text-lg mb-2">Пользователь не найден</p>
          <p class="text-white/55 text-sm mb-6">Возможно, аккаунт был удалён или ссылка неверна</p>
          <button @click="router.push({ name: 'home' })" class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-card border border-brand-border hover:border-brand-accent text-sm font-bold rounded-xl transition-all">
            <BIcon name="ArrowLeft" class="w-4 h-4" /> На главную
          </button>
        </div>

        <template v-else>

          <!-- ════════════════════════════════════════════════════════════════
               BANNER
          ════════════════════════════════════════════════════════════════ -->
          <div class="relative w-full h-52 md:h-64 rounded-3xl overflow-hidden cursor-pointer" :style="bannerStyle"
            @click="viewedProfile.banner_url && (showBannerViewer = true)">
            <!-- Gradient overlays -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
            <div class="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent"></div>

            <!-- Top-right: upload banner button for own profile -->
            <div v-if="isOwnProfile" class="absolute top-3 right-3 z-10">
              <button @click.stop="bannerFileInput?.click()"
                :disabled="isUploadingBanner"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/50 hover:bg-black/70 border border-white/15 rounded-full text-xs font-semibold text-white/90 backdrop-blur-sm transition-all disabled:opacity-50">
                <span v-if="isUploadingBanner" class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <BIcon v-else name="Image" class="w-3 h-3" /> Баннер
              </button>
            </div>

            <!-- Bottom-right: persona chip — raised so it doesn't hide behind the card overlap -->
            <div class="absolute bottom-8 right-4 z-10 flex gap-2">
              <span v-if="viewedProfile.persona"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm border"
                :style="accentStyleSubtle">
                <span class="text-sm leading-none">{{ personaEmoji(viewedProfile.persona) }}</span>{{ viewedProfile.persona }}
              </span>
            </div>
          </div>

          <!-- ════════════════════════════════════════════════════════════════
               PROFILE IDENTITY STRIP
          ════════════════════════════════════════════════════════════════ -->
          <div class="relative z-10 -mt-6 mx-0">
            <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl">
              <!-- Accent line top -->
              <div class="h-px bg-gradient-to-r from-transparent via-brand-accent/60 to-transparent rounded-t-3xl"></div>

              <div class="px-6 pt-0 pb-5">
                <div class="flex items-start justify-between gap-4">

                  <!-- ══ Avatar block — dual card stack swap ══ -->
                  <!--
                    Две карты. GPU-ускоренная анимация через transform (translate+scale).
                    Активная — translate-x-0/y-0 scale-100, спящая — translate-x-7/y-7 scale-[0.78].
                    Плавный spring-easing: cubic-bezier(0.34,1.56,0.64,1).
                  -->
                  <div class="relative flex-shrink-0 -mt-12 md:-mt-16 w-24 h-24 md:w-32 md:h-32 overflow-visible">

                    <!-- ── Story ring: animated gradient, sits behind avatar ── -->
                    <div
                      v-if="hasStory"
                      class="absolute -inset-[4px] rounded-full story-ring-gradient z-[5] pointer-events-none"
                    ></div>

                    <!-- ── Карта A: ОСНОВНОЙ аватар ──────────────────────── -->
                    <div
                      class="absolute top-0 left-0 w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden shadow-xl will-change-transform
                             transition-[transform,opacity,border-color,box-shadow] duration-500 translate-x-0 translate-y-0 scale-100 opacity-100 z-10"
                      :class="hasStory ? 'border-[4px] border-brand-card cursor-pointer hover:scale-105' : 'border-4 border-brand-card'"
                      :style="hasStory ? {} : [avatarRingStyle, { transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)' }]"
                      @click="onAvatarClick">
                      <img :src="avatarSrc || '/icons/badges/NN.jpg'"
                        class="w-full h-full object-cover"
                        width="128" height="128" fetchpriority="high" />
                      <!-- Story tap affordance -->
                      <div v-if="hasStory"
                        class="absolute inset-0 rounded-full bg-black/0 hover:bg-black/30 transition-all flex items-center justify-center opacity-0 hover:opacity-100">
                        <div class="flex flex-col items-center gap-0.5">
                          <BIcon name="Play" class="w-6 h-6 text-white drop-shadow" />
                          <span class="text-[10px] font-bold text-white drop-shadow">История</span>
                        </div>
                      </div>
                      <!-- upload camera: только для своего профиля без истории -->
                      <button v-if="isOwnProfile && !hasStory"
                        @click.stop="avatarFileInput?.click()" :disabled="isUploadingAvatar"
                        class="absolute inset-0 rounded-full bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center pointer-events-none hover:pointer-events-auto opacity-0 hover:opacity-100">
                        <span v-if="isUploadingAvatar" class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <BIcon v-else name="Camera" class="w-7 h-7 text-white drop-shadow" />
                      </button>
                    </div>

                    <!-- Online dot (z-30 чтобы всегда поверх карт) -->
                    <span v-if="isProfileOnline"
                      class="absolute bottom-1 right-1 md:bottom-1.5 md:right-1.5 w-4 h-4 md:w-5 md:h-5 rounded-full bg-brand-success border-[3px] border-brand-card shadow-sm z-30 transition-all duration-500"
                      title="Онлайн" />
                  </div>

                  <!-- Action buttons (positioned to side of avatar) -->
                  <div class="flex items-center gap-2 pt-3 md:pt-4 pr-1 flex-wrap">
                    <template v-if="isOwnProfile">
                      <router-link to="/settings/profile"
                        class="relative inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-accent to-brand-accent-plus text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-accent/30 hover:shadow-brand-accent/50 hover:scale-[1.03] active:scale-[0.98] transition-all overflow-hidden group">
                        <span class="absolute inset-0 bg-white/0 group-hover:bg-white/8 transition-colors duration-200" />
                        <BIcon name="Pencil" class="w-4 h-4 relative z-10" />
                        <span class="relative z-10">Изменить профиль</span>
                      </router-link>
                    </template>
                    <template v-else-if="authStore.isAuthenticated">
                      <button
                        @click="toggleNotify"
                        :disabled="!relation.aFollowsB || notifyLoading"
                        :title="!relation.aFollowsB ? 'Сначала подпишитесь' : notifyPosts ? 'Уведомления включены' : 'Уведомления выключены'"
                        class="w-9 h-9 flex items-center justify-center border rounded-xl transition-all disabled:opacity-40"
                        :class="notifyPosts && relation.aFollowsB ? 'border-brand-accent bg-brand-accent/15 text-brand-accent' : 'border-brand-border bg-brand-bg hover:border-brand-accent/60 text-white/55 hover:text-brand-accent'">
                        <span v-if="notifyLoading" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <BIcon v-else :name="notifyPosts && relation.aFollowsB ? 'BellRing' : 'Bell'" class="w-4 h-4" />
                      </button>
                      <button @click="openChat" class="inline-flex items-center gap-2 px-4 py-2 border border-brand-border bg-brand-bg hover:border-brand-accent/60 text-brand-offwhite hover:text-brand-accent rounded-xl text-sm font-bold transition-all">
                        <BIcon name="MessageSquare" class="w-4 h-4" /> {{ langStore.t.messageBtn }}
                      </button>
                      <button @click="toggleFollow" :disabled="isTogglingFollow"
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-sm"
                        :class="followBtnClass">
                        <span v-if="isTogglingFollow" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <component v-else :is="followBtnIcon" class="w-4 h-4" />
                        {{ followBtnLabel }}
                        <span v-if="isMutual && !isTogglingFollow" class="text-[10px] font-bold ml-0.5 opacity-60">· Взаимно</span>
                      </button>
                      <button class="w-9 h-9 flex items-center justify-center border border-brand-border bg-brand-bg hover:border-brand-border/80 rounded-xl text-white/55 hover:text-white transition-all">
                        <BIcon name="MoreHorizontal" class="w-4 h-4" />
                      </button>
                    </template>
                  </div>
                </div>

                <!-- Name row -->
                <div class="mt-3">
                  <div class="flex items-center flex-wrap gap-2 mb-1">
                    <h1 class="text-2xl md:text-3xl font-extrabold leading-none text-white">{{ profileDisplayName }}</h1>
                    <!-- Verification badge -->
                    <img v-if="(viewedProfile as any)?.is_verified"
                      src="/icons/badges/paw_offical.svg"
                      class="w-6 h-6 flex-shrink-0"
                      title="Верифицирован" />
                    <span v-if="badgePillLabel" class="inline-flex items-center justify-center w-7 h-7 rounded-lg" :class="badgePillClass" :title="badgePillLabel">
                      <component :is="badgePillIcon" class="w-4 h-4" />
                    </span>
                    <!-- Subscription tier badge -->
                    <span v-if="(viewedProfile as any).subscription_tier && (viewedProfile as any).subscription_tier !== 'free'"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-widest border"
                      :class="{
                        'bg-brand-accent/15 border-brand-accent/40 text-brand-accent': (viewedProfile as any).subscription_tier === 'lite',
                        'bg-violet-500/15 border-violet-500/40 text-violet-300': (viewedProfile as any).subscription_tier === 'pro',
                        'bg-amber-500/15 border-amber-500/40 text-amber-400': (viewedProfile as any).subscription_tier === 'business',
                      }">
                      <Sparkles class="w-2.5 h-2.5" />
                      {{ (viewedProfile as any).subscription_tier === 'lite' ? 'Lite' : (viewedProfile as any).subscription_tier === 'pro' ? 'Pro' : 'Business' }}
                    </span>
                    <!-- Artist Badge -->
                    <AppBadge
                      v-if="(viewedProfile as any).badge_level && (viewedProfile as any).badge_level !== 'none'"
                      type="user"
                      :level="(viewedProfile as any).badge_level"
                      size="sm"
                    />
                    <!-- SOON Badges -->
                    <SoonBadge
                      v-for="badge in profileSoonBadges"
                      :key="badge.id"
                      :short-code="badge.event.short_code"
                      :event-title="badge.event.title"
                      :starts-at="badge.event.starts_at"
                      :ends-at="badge.event.ends_at"
                      :status="badge.event.status"
                      :banner-url="badge.event.banner_url || badge.event.group.banner_url"
                      :group-name="badge.event.group.name"
                      :group-avatar="badge.event.group.avatar_url"
                      :location-name="badge.event.location_name"
                      :attendee-count="badge.event.attendee_count"
                      class="cursor-pointer"
                      @click="$router.push(`/groups/${badge.event.group.slug}`)"
                    />
                  </div>
                  <div class="flex items-center gap-3 flex-wrap text-sm">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-accent/10 border border-brand-accent/25 rounded-lg text-xs font-bold text-brand-accent tracking-wide">
                      <BIcon name="AtSign" class="w-3 h-3" />{{ viewedProfile.username }}
                    </span>
                    <span v-if="viewedProfile.job_title" class="flex items-center gap-1 text-white/55 text-xs">
                      <BIcon name="Briefcase" class="w-3.5 h-3.5" />{{ viewedProfile.job_title }}
                    </span>
                    <span v-if="viewedProfile.location || (viewedProfile as any).country" class="flex items-center gap-1 text-white/55 text-xs">
                      <BIcon name="MapPin" class="w-3.5 h-3.5" />{{ placeStr }}
                    </span>
                    <span class="flex items-center gap-1 text-white/55 text-xs">
                      <BIcon name="Calendar" class="w-3.5 h-3.5" />{{ joinDate }}
                    </span>
                    <a v-if="viewedProfile.website" :href="viewedProfile.website" target="_blank"
                      class="flex items-center gap-1 text-brand-accent text-xs hover:underline">
                      <BIcon name="Link" class="w-3.5 h-3.5" />{{ viewedProfile.website.replace(/^https?:\/\//, '') }}
                    </a>
                  </div>

                  <!-- Bio -->
                  <p v-if="profileBio" class="mt-3 text-sm leading-relaxed max-w-2xl text-white/75">{{ profileBio }}</p>


                </div>
              </div>
            </div>
          </div>

          <!-- ════════════════════════════════════════════════════════════════
               TWO-COLUMN: CENTER + RIGHT
          ════════════════════════════════════════════════════════════════ -->
          <div class="flex gap-4 mt-4 items-start">

            <!-- ── CENTER COLUMN ────────────────────────────────────────── -->
            <div class="flex-1 min-w-0 space-y-4">

              <!-- About tabs card -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="flex border-b border-brand-border overflow-x-auto scrollbar-hide bg-brand-bg/40">
                  <button v-for="nav in aboutNavs" :key="nav.key"
                    @click="aboutTab = nav.key"
                    class="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px flex-shrink-0"
                    :class="aboutTab === nav.key
                      ? 'border-brand-accent text-brand-accent'
                      : 'border-transparent text-white/55 hover:text-white'">
                    <component :is="nav.icon" class="w-4 h-4" />{{ nav.label }}
                  </button>
                </div>

                <div class="p-5">
                  <!-- О себе -->
                  <div v-if="aboutTab === 'about'" class="space-y-4">

                    <!-- Bio (с кнопкой редактирования) -->
                    <div class="relative group/bio">
                      <div v-if="viewedProfile.bio"
                        class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl px-5 py-4 pr-12">
                        <p class="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{{ viewedProfile.bio }}</p>
                      </div>
                      <div v-else-if="isOwnProfile" class="flex flex-col items-center gap-2 py-6 text-center bg-brand-bg/30 rounded-2xl border border-dashed border-brand-border/60 cursor-pointer hover:border-brand-accent/40 transition-all"
                        @click="openEditModal('bio')">
                        <BIcon name="FileText" class="w-7 h-7 text-white/25" />
                        <p class="text-xs text-white/40">{{ langStore.t.addDescription }}</p>
                      </div>
                      <button v-if="isOwnProfile && viewedProfile.bio" @click="openEditModal('bio')"
                        class="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-brand-accent hover:bg-brand-card border border-transparent hover:border-brand-border opacity-0 group-hover/bio:opacity-100 transition-all">
                        <BIcon name="Pencil" class="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <!-- Уникальные поля (не дублируются в шапке) -->
                    <div class="space-y-2">

                      <!-- Отношения + партнёр -->
                      <div v-if="viewedProfile.relationship_status"
                        class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                        <div class="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center flex-shrink-0">
                          <BIcon name="Heart" class="w-4 h-4 text-pink-400" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-[10px] text-white/40 uppercase tracking-wide mb-0.5">Отношения</p>
                          <p class="text-sm text-white font-semibold">{{ { single: 'Свободен/а', in_relationship: 'В отношениях', relationship: 'В отношениях', married: 'В браке', complicated: 'Всё сложно', open: 'Открытые', open_relationship: 'Открытые отношения', looking: 'В поиске', secret: 'Секрет' }[viewedProfile.relationship_status] ?? viewedProfile.relationship_status }}</p>
                          <div v-if="partnerProfile" class="flex items-center gap-2 mt-1.5">
                            <img v-if="partnerProfile.avatar_url" :src="partnerProfile.avatar_url" class="w-5 h-5 rounded-full object-cover flex-shrink-0 border border-pink-500/30" />
                            <div v-else class="w-5 h-5 rounded-full bg-pink-500/20 flex items-center justify-center text-[10px] font-bold text-pink-300 flex-shrink-0">{{ (partnerProfile.display_name ?? partnerProfile.username)[0] }}</div>
                            <span class="text-xs text-pink-300 font-medium truncate">с {{ partnerProfile.display_name ?? partnerProfile.username }}</span>
                            <span v-if="togetherSince" class="text-[10px] text-white/35 ml-auto flex-shrink-0">{{ togetherSince }}</span>
                          </div>
                        </div>
                      </div>

                      <!-- Персонаж / фурсона с именем и цветом -->
                      <div v-if="viewedProfile.persona"
                        class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                        <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                          :style="(viewedProfile as any).fursona_color ? `background:${(viewedProfile as any).fursona_color}20;border:1px solid ${(viewedProfile as any).fursona_color}30` : 'background:rgba(255,255,255,0.06)'">
                          {{ personaEmoji(viewedProfile.persona) }}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-[10px] text-white/40 uppercase tracking-wide mb-0.5">Персонаж</p>
                          <div class="flex items-center gap-2">
                            <p class="text-sm text-white font-semibold truncate">{{ (viewedProfile as any).fursona_name || viewedProfile.persona }}</p>
                            <span v-if="(viewedProfile as any).fursona_name" class="text-xs text-white/40">{{ viewedProfile.persona }}</span>
                          </div>
                          <div v-if="(viewedProfile as any).fursona_color" class="flex items-center gap-1.5 mt-1">
                            <span class="w-3 h-3 rounded-sm border border-black/20 flex-shrink-0" :style="`background:${(viewedProfile as any).fursona_color}`"></span>
                            <span class="text-[10px] text-white/35">{{ (viewedProfile as any).fursona_color }}</span>
                          </div>
                        </div>
                        <button v-if="isOwnProfile" @click="openEditModal('fursona')"
                          class="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-brand-accent hover:bg-brand-card border border-transparent hover:border-brand-border transition-all">
                          <BIcon name="Pencil" class="w-3 h-3" />
                        </button>
                      </div>

                      <!-- Местоимения (только если есть, компактно) -->
                      <div v-if="viewedProfile.pronouns"
                        class="flex items-center gap-3 px-4 py-2.5 bg-brand-bg border border-brand-border rounded-2xl">
                        <BIcon name="Quote" class="w-4 h-4 text-brand-accent/60 flex-shrink-0" />
                        <div>
                          <p class="text-[10px] text-white/40 uppercase tracking-wide">Местоимения</p>
                          <p class="text-xs text-white/80 font-semibold">{{ viewedProfile.pronouns }}</p>
                        </div>
                      </div>

                    </div>

                    <!-- Пусто (только редактируемый профиль) -->
                    <div v-if="isOwnProfile && !viewedProfile.relationship_status && !viewedProfile.persona" class="pt-1">
                      <p class="text-xs text-white/30 text-center">Добавь информацию в настройках ↗</p>
                    </div>

                    <!-- Edit shortcuts (own profile) -->
                    <div v-if="isOwnProfile" class="flex gap-2 flex-wrap pt-2 border-t border-brand-border/40">
                      <button @click="openEditModal('basics')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white/55 hover:text-white bg-brand-bg border border-brand-border hover:border-brand-accent/40 rounded-xl transition-all">
                        <BIcon name="User" class="w-3 h-3" /> Основное
                      </button>
                      <button @click="openEditModal('contacts')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white/55 hover:text-white bg-brand-bg border border-brand-border hover:border-brand-accent/40 rounded-xl transition-all">
                        <BIcon name="MapPin" class="w-3 h-3" /> Контакты
                      </button>
                      <button @click="openEditModal('socials')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white/55 hover:text-white bg-brand-bg border border-brand-border hover:border-brand-accent/40 rounded-xl transition-all">
                        <BIcon name="AtSign" class="w-3 h-3" /> Соцсети
                      </button>
                    </div>

                  </div>

                  <!-- ── ФУРСОНА (новый стиль) ────────────────────────── -->
                  <div v-else-if="aboutTab === 'fursona'" class="space-y-4">

                    <!-- Загрузка -->
                    <div v-if="profileFursonaLoading" class="flex items-center justify-center py-16">
                      <div class="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                    </div>

                    <!-- Нет фурсоны -->
                    <div v-else-if="!profileFursona" class="flex flex-col items-center gap-4 py-14 rounded-3xl border border-dashed border-brand-border text-center bg-brand-bg/30">
                      <span class="text-5xl opacity-30">🦊</span>
                      <p class="text-sm font-semibold text-white/55">Фурсона не добавлена</p>
                      <button v-if="isOwnProfile" @click="openEditModal('fursona')"
                        class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/30 text-brand-accent rounded-xl text-sm font-bold transition-all">
                        <BIcon name="Plus" class="w-4 h-4" /> Создать фурсону
                      </button>
                    </div>

                    <!-- Карточка фурсоны -->
                    <template v-else>
                      <!-- Шапка: имя + виды + редактирование -->
                      <div class="rounded-3xl border border-brand-border bg-brand-card shadow-xl overflow-hidden">
                        <!-- Gradient header -->
                        <div class="relative px-5 py-5 border-b border-brand-border/60"
                          :style="profileFursona.colors?.length
                            ? `background:linear-gradient(135deg,${profileFursona.colors[0]}18 0%,${(profileFursona.colors[1] ?? profileFursona.colors[0])}0c 60%,transparent 100%)`
                            : 'background:linear-gradient(135deg,#7c3aed18 0%,transparent 100%)'">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0 flex-1">
                              <p class="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Фурсона</p>
                              <h2 class="text-2xl md:text-3xl font-extrabold text-white truncate leading-tight">
                                {{ profileFursona.name || viewedProfile?.display_name || '—' }}
                              </h2>
                              <!-- Виды как чипы -->
                              <div v-if="profileFursona.species?.length" class="flex flex-wrap gap-1.5 mt-2">
                                <span v-for="sp in profileFursona.species" :key="sp"
                                  class="px-2.5 py-1 rounded-lg text-xs font-bold border"
                                  :style="profileFursona.colors?.length
                                    ? `background:${profileFursona.colors[0]}20;border-color:${profileFursona.colors[0]}40;color:${profileFursona.colors[0]}`
                                    : 'background:rgba(124,58,237,0.15);border-color:rgba(124,58,237,0.3);color:#a78bfa'">
                                  {{ sp }}
                                </span>
                              </div>
                            </div>
                            <!-- Цветовая палитра -->
                            <div class="flex flex-col items-end gap-2 flex-shrink-0">
                              <button v-if="isOwnProfile" @click="openEditModal('fursona')"
                                class="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-bg border border-brand-border hover:border-brand-accent text-white/55 hover:text-brand-accent transition-all">
                                <BIcon name="Pencil" class="w-3.5 h-3.5" />
                              </button>
                              <div v-if="profileFursona.colors?.length" class="flex gap-1">
                                <div v-for="c in profileFursona.colors.slice(0,6)" :key="c"
                                  class="w-5 h-5 rounded-md border border-black/20 shadow-sm cursor-pointer hover:scale-110 transition-transform"
                                  :style="`background:${c}`"
                                  :title="c"></div>
                                <div v-if="profileFursona.colors.length > 6"
                                  class="w-5 h-5 rounded-md border border-brand-border bg-brand-bg flex items-center justify-center text-[9px] font-bold text-white/60">
                                  +{{ profileFursona.colors.length - 6 }}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- Тело: реф + инфо -->
                        <div class="p-4 grid grid-cols-1 xl:grid-cols-[1fr_1.15fr] gap-4">
                          <!-- Левая колонка: референс -->
                          <div class="space-y-2">
                            <!-- Референс изображение -->
                            <button v-if="profileFursona.reference_image_url" type="button"
                              class="w-full relative rounded-2xl overflow-hidden border border-brand-border/60 group shadow-lg"
                              style="height:280px"
                              @click="openFursonaRef(profileFursona!.reference_image_url!)">
                              <img :src="profileFursona.reference_image_url"
                                class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                :class="profileFursona.reference_is_nsfw && !nsfwMode ? 'blur-xl' : ''"
                                alt="Референс фурсоны" />
                              <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent group-hover:from-black/60 transition-all"></div>
                              <div v-if="profileFursona.reference_is_nsfw && !nsfwMode"
                                class="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <span class="px-3 py-1.5 rounded-xl bg-black/70 border border-rose-500/50 text-rose-400 text-xs font-bold">18+ NSFW</span>
                                <span class="text-white/60 text-xs">Скрыто</span>
                              </div>
                              <div v-else class="absolute top-3 left-3">
                                <span class="px-2.5 py-1 rounded-lg bg-black/50 border border-white/15 text-[10px] font-bold text-white/85 uppercase tracking-wider backdrop-blur-sm">Reference</span>
                              </div>
                              <div class="absolute bottom-3 left-4 right-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                <span class="text-white text-sm font-bold">{{ profileFursona.name }}</span>
                                <span class="px-2 py-1 rounded-lg bg-black/50 border border-white/20 text-[11px] font-bold text-white backdrop-blur-sm">Открыть</span>
                              </div>
                            </button>
                            <div v-else class="rounded-2xl border-2 border-dashed border-brand-border/40 flex flex-col items-center justify-center text-center opacity-60 bg-brand-bg/30" style="height:200px">
                              <BIcon name="Image" class="w-8 h-8 text-white/40 mb-2" />
                              <p class="text-xs font-semibold text-white/40">Референс не добавлен</p>
                            </div>

                            <!-- Цвета - большие свотчи -->
                            <div v-if="profileFursona.colors?.length" class="grid gap-1.5" :class="profileFursona.colors.length > 3 ? 'grid-cols-4' : 'grid-cols-3'">
                              <div v-for="c in profileFursona.colors" :key="c"
                                class="rounded-xl border border-black/20 shadow-sm relative group/swatch cursor-default"
                                style="height:40px"
                                :style="`background:${c}`">
                                <span class="absolute inset-0 flex items-center justify-center opacity-0 group-hover/swatch:opacity-100 transition-opacity">
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-white backdrop-blur-sm">{{ c }}</span>
                                </span>
                              </div>
                            </div>

                            <!-- Кредит художника референса -->
                            <div v-if="profileFursona.reference_artist_name"
                              class="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-brand-bg/60 border border-brand-border/50 mt-1">
                              <svg class="w-3 h-3 text-white/35 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                              </svg>
                              <span class="text-[10px] text-white/35">Арт:</span>
                              <a v-if="profileFursona.reference_artist_url"
                                :href="profileFursona.reference_artist_url" target="_blank" rel="noopener noreferrer"
                                class="text-[11px] font-semibold text-brand-accent hover:underline truncate"
                                @click.stop>{{ profileFursona.reference_artist_name }}</a>
                              <span v-else class="text-[11px] font-semibold text-white/60 truncate">{{ profileFursona.reference_artist_name }}</span>
                            </div>
                          </div>

                          <!-- Правая колонка: табы с инфо -->
                          <div class="rounded-2xl border border-brand-border/60 bg-brand-bg/40 overflow-hidden">
                            <!-- Вкладки -->
                            <div class="flex border-b border-brand-border/60">
                              <button v-for="tab in fursonaViewTabs" :key="tab.key"
                                @click="fursonaSubTab = tab.key"
                                class="flex-1 px-3 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px"
                                :class="fursonaSubTab === tab.key
                                  ? 'text-brand-accent border-brand-accent bg-brand-accent/5'
                                  : 'text-white/45 border-transparent hover:text-white/70 hover:bg-white/4'">
                                {{ tab.label }}
                                <span v-if="tab.count" class="ml-1 text-[9px] opacity-60">({{ tab.count }})</span>
                              </button>
                            </div>

                            <div class="p-4 min-h-[15rem]">
                              <!-- Личность -->
                              <template v-if="fursonaSubTab === 'personality'">
                                <template v-if="profileFursona.likes_dislikes_visible || isOwnProfile">
                                  <!-- Оба пустые → компактный плейсхолдер -->
                                  <div v-if="!profileFursona.likes?.length && !profileFursona.dislikes?.length"
                                    class="flex flex-col items-center justify-center gap-3 py-8 text-center">
                                    <div class="w-12 h-12 rounded-2xl flex items-center justify-center opacity-30"
                                      style="background:rgba(167,139,250,0.15)">
                                      <svg class="w-6 h-6 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                                      </svg>
                                    </div>
                                    <div>
                                      <p class="text-sm font-semibold text-white/40">Предпочтения не указаны</p>
                                      <p v-if="profileFursona.reference_artist_name" class="text-xs text-white/25 mt-1">
                                        Реф нарисован:
                                        <a v-if="profileFursona.reference_artist_url"
                                          :href="profileFursona.reference_artist_url" target="_blank" rel="noopener noreferrer"
                                          class="text-brand-accent hover:underline font-semibold">{{ profileFursona.reference_artist_name }}</a>
                                        <span v-else class="text-white/50 font-semibold">{{ profileFursona.reference_artist_name }}</span>
                                      </p>
                                    </div>
                                  </div>
                                  <!-- Есть хотя бы что-то → два блока -->
                                  <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div class="p-3 rounded-xl border" style="background:rgba(34,197,94,0.06);border-color:rgba(34,197,94,0.2)">
                                      <p class="text-xs font-extrabold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style="color:#4ade80">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                                        Любит
                                      </p>
                                      <div v-if="profileFursona.likes?.length" class="flex flex-wrap gap-1.5">
                                        <span v-for="item in profileFursona.likes" :key="`like-${item}`"
                                          class="px-2 py-0.5 rounded-lg text-xs font-semibold" style="background:rgba(34,197,94,0.12);color:rgba(134,239,172,1)">
                                          {{ item }}
                                        </span>
                                      </div>
                                      <p v-else class="text-white/35 text-xs">Не заполнено</p>
                                    </div>
                                    <div class="p-3 rounded-xl border" style="background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.2)">
                                      <p class="text-xs font-extrabold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style="color:#f87171">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                                        Не любит
                                      </p>
                                      <div v-if="profileFursona.dislikes?.length" class="flex flex-wrap gap-1.5">
                                        <span v-for="item in profileFursona.dislikes" :key="`dislike-${item}`"
                                          class="px-2 py-0.5 rounded-lg text-xs font-semibold" style="background:rgba(239,68,68,0.12);color:rgba(252,165,165,1)">
                                          {{ item }}
                                        </span>
                                      </div>
                                      <p v-else class="text-white/35 text-xs">Не заполнено</p>
                                    </div>
                                  </div>
                                </template>
                                <div v-else class="flex flex-col items-center justify-center py-10 gap-2 text-center">
                                  <BIcon name="EyeOff" class="w-8 h-8 text-white/25" />
                                  <p class="text-sm font-semibold text-white/40">Скрыто владельцем</p>
                                </div>
                              </template>

                              <!-- Информация -->
                              <template v-else-if="fursonaSubTab === 'info'">
                                <div class="space-y-2 text-sm">
                                  <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-brand-card border border-brand-border">
                                    <span class="text-white/45 text-xs font-semibold uppercase tracking-wider">Имя</span>
                                    <span class="font-bold text-white truncate">{{ profileFursona.name || '—' }}</span>
                                  </div>
                                  <div v-if="profileFursona.species?.length"
                                    class="flex items-start justify-between gap-3 p-3 rounded-xl bg-brand-card border border-brand-border">
                                    <span class="text-white/45 text-xs font-semibold uppercase tracking-wider flex-shrink-0">Вид</span>
                                    <div class="flex flex-wrap gap-1 justify-end">
                                      <span v-for="sp in profileFursona.species" :key="sp"
                                        class="px-2 py-0.5 rounded-md text-xs font-bold"
                                        style="background:rgba(124,58,237,0.2);color:#a78bfa">{{ sp }}</span>
                                    </div>
                                  </div>
                                  <div v-if="profileFursona.colors?.length"
                                    class="flex items-center justify-between gap-3 p-3 rounded-xl bg-brand-card border border-brand-border">
                                    <span class="text-white/45 text-xs font-semibold uppercase tracking-wider">Цвета</span>
                                    <div class="flex gap-1.5">
                                      <div v-for="c in profileFursona.colors" :key="c"
                                        class="w-5 h-5 rounded-md border border-black/20"
                                        :style="`background:${c}`" :title="c"></div>
                                    </div>
                                  </div>
                                </div>
                              </template>

                              <!-- Особенности (цвета крупно) -->
                              <template v-else-if="fursonaSubTab === 'features'">
                                <div class="space-y-3">
                                  <p class="text-[10px] font-bold uppercase tracking-wider text-white/40">Цветовая палитра</p>
                                  <div v-if="profileFursona.colors?.length" class="grid grid-cols-2 gap-2">
                                    <div v-for="c in profileFursona.colors" :key="c"
                                      class="rounded-xl border border-black/15 flex items-center gap-2.5 px-3"
                                      style="height:44px"
                                      :style="`background:${c}20;border-color:${c}30`">
                                      <div class="w-6 h-6 rounded-lg border border-black/20 shadow-sm flex-shrink-0" :style="`background:${c}`"></div>
                                      <span class="text-xs font-bold text-white/80 font-mono">{{ c }}</span>
                                    </div>
                                  </div>
                                  <p v-else class="text-white/35 text-xs">Цвета не указаны</p>
                                </div>
                              </template>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- ── ФУРСЬЮТ (новый стиль) ─────────────────────────── -->
                  <div v-else-if="aboutTab === 'fursuit'" class="space-y-4">

                    <!-- Загрузка -->
                    <div v-if="profileFursuitsLoading" class="flex items-center justify-center py-16">
                      <div class="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                    </div>

                    <!-- Нет фурсьютов -->
                    <div v-else-if="!profileFursuits.length" class="flex flex-col items-center gap-4 py-14 rounded-3xl border border-dashed border-brand-border text-center bg-brand-bg/30">
                      <span class="text-5xl opacity-30">🐾</span>
                      <p class="text-sm font-semibold text-white/55">Фурсьют не добавлен</p>
                      <button v-if="isOwnProfile" @click="openEditModal('fursuit')"
                        class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/30 text-brand-accent rounded-xl text-sm font-bold transition-all">
                        <BIcon name="Plus" class="w-4 h-4" /> Добавить фурсьют
                      </button>
                    </div>

                    <!-- Список фурсьютов -->
                    <template v-else>
                      <div class="flex items-center justify-between mb-1 px-1">
                        <p class="text-[10px] font-bold uppercase tracking-widest text-white/40">
                          Фурсьюты · {{ profileFursuits.length }}
                        </p>
                        <button v-if="isOwnProfile" @click="openEditModal('fursuit')"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/30 text-brand-accent text-xs font-bold transition-all">
                          <BIcon name="Settings" class="w-3.5 h-3.5" /> Управление
                        </button>
                      </div>

                      <!-- ══ Hero card (1 fursuit) ════════════════════════════ -->
                      <div v-if="profileFursuits.length === 1"
                        class="rounded-3xl border border-brand-border bg-brand-card shadow-xl overflow-hidden group hover:border-brand-accent/40 transition-all">
                        <!-- Большое фото -->
                        <div class="relative bg-brand-bg overflow-hidden"
                          :style="profileFursuits[0].image_url ? 'height:22rem' : 'height:10rem'">
                          <template v-if="profileFursuits[0].image_url">
                            <img :src="profileFursuits[0].image_url"
                              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                              :class="profileFursuits[0].is_nsfw && !nsfwMode ? 'blur-xl scale-110' : ''"
                              alt="Фурсьют" />
                            <!-- NSFW overlay -->
                            <div v-if="profileFursuits[0].is_nsfw && !nsfwMode"
                              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                              <span class="px-4 py-2 rounded-2xl bg-black/80 border border-rose-500/60 text-rose-400 text-sm font-bold">18+ NSFW</span>
                            </div>
                            <div v-else-if="profileFursuits[0].is_nsfw"
                              class="absolute top-4 right-4 px-2.5 py-1 rounded-lg bg-rose-500/80 text-white text-xs font-bold backdrop-blur-sm">
                              18+
                            </div>
                            <!-- Градиент снизу -->
                            <div class="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-brand-card via-brand-card/60 to-transparent"></div>
                          </template>
                          <div v-else class="w-full h-full flex items-center justify-center opacity-20">
                            <span class="text-7xl">🐾</span>
                          </div>
                        </div>

                        <!-- Информация под фото -->
                        <div class="p-5 -mt-2 space-y-3">
                          <!-- Описание -->
                          <p v-if="profileFursuits[0].description" class="text-sm text-white/80 leading-relaxed">
                            {{ profileFursuits[0].description }}
                          </p>

                          <!-- Мастер (Bloomly группа) -->
                          <div v-if="profileFursuits[0].maker_id && makerGroupCache[profileFursuits[0].maker_id]"
                            class="flex items-center gap-2 flex-wrap">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1">
                              <BIcon name="Scissors" class="w-3 h-3" /> Мастер
                            </span>
                            <RouterLink
                              :to="`/groups/${makerGroupCache[profileFursuits[0].maker_id].slug}`"
                              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent text-xs font-bold hover:bg-brand-accent/20 hover:border-brand-accent/50 transition-all"
                              @click.stop>
                              <img v-if="makerGroupCache[profileFursuits[0].maker_id].avatar_url"
                                :src="makerGroupCache[profileFursuits[0].maker_id].avatar_url!"
                                class="w-4 h-4 rounded-full object-cover" />
                              <BIcon v-else name="Users" class="w-3.5 h-3.5" />
                              {{ makerGroupCache[profileFursuits[0].maker_id].name }}
                            </RouterLink>
                          </div>

                          <!-- Внешние ссылки мастера -->
                          <div v-if="profileFursuits[0].external_maker_links?.length" class="flex flex-wrap gap-1.5">
                            <span v-if="!profileFursuits[0].maker_id || !makerGroupCache[profileFursuits[0].maker_id]"
                              class="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1 w-full">
                              <BIcon name="Scissors" class="w-3 h-3" /> Мастер
                            </span>
                            <a v-for="link in profileFursuits[0].external_maker_links" :key="link"
                              :href="link" target="_blank" rel="noopener noreferrer"
                              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-bg border border-brand-border text-white/70 hover:text-brand-accent hover:border-brand-accent/50 text-xs font-semibold transition-all"
                              @click.stop>
                              <BIcon name="ExternalLink" class="w-3 h-3" />
                              {{ link.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0] }}
                            </a>
                          </div>

                          <!-- Пустой placeholder -->
                          <div v-if="!profileFursuits[0].description && !profileFursuits[0].external_maker_links?.length && !(profileFursuits[0].maker_id && makerGroupCache[profileFursuits[0].maker_id])">
                            <p class="text-xs text-white/30 italic">Описание не добавлено</p>
                          </div>
                        </div>
                      </div>

                      <!-- ══ Grid (2+ fursuits) ═══════════════════════════════ -->
                      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div v-for="suit in profileFursuits" :key="suit.id"
                          class="rounded-3xl border border-brand-border bg-brand-card shadow-lg overflow-hidden group hover:border-brand-accent/40 transition-all">
                          <!-- Фото -->
                          <div class="relative h-56 bg-brand-bg overflow-hidden">
                            <template v-if="suit.image_url">
                              <img :src="suit.image_url"
                                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                :class="suit.is_nsfw && !nsfwMode ? 'blur-xl scale-110' : ''"
                                alt="Фото фурсьюта" />
                              <div v-if="suit.is_nsfw && !nsfwMode"
                                class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
                                <span class="px-3 py-1.5 rounded-xl bg-black/70 border border-rose-500/50 text-rose-400 text-xs font-bold">18+ NSFW</span>
                              </div>
                              <div v-else-if="suit.is_nsfw"
                                class="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-rose-500/80 text-white text-[10px] font-bold">
                                18+
                              </div>
                            </template>
                            <div v-else class="w-full h-full flex items-center justify-center opacity-30">
                              <span class="text-5xl">🐾</span>
                            </div>
                            <div v-if="suit.image_url" class="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-brand-card to-transparent"></div>
                          </div>

                          <!-- Информация -->
                          <div class="p-4 space-y-2.5 -mt-1">
                            <div v-if="suit.description" class="text-sm text-white/75 leading-relaxed line-clamp-3">
                              {{ suit.description }}
                            </div>

                            <!-- Мастер — Bloomly группа -->
                            <div v-if="suit.maker_id && makerGroupCache[suit.maker_id]" class="flex items-center gap-2 flex-wrap">
                              <span class="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1">
                                <BIcon name="Scissors" class="w-3 h-3" /> Мастер
                              </span>
                              <RouterLink
                                :to="`/groups/${makerGroupCache[suit.maker_id].slug}`"
                                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent text-xs font-bold hover:bg-brand-accent/20 transition-all"
                                @click.stop>
                                <img v-if="makerGroupCache[suit.maker_id].avatar_url"
                                  :src="makerGroupCache[suit.maker_id].avatar_url!"
                                  class="w-3.5 h-3.5 rounded-full object-cover" />
                                <BIcon v-else name="Users" class="w-3 h-3" />
                                {{ makerGroupCache[suit.maker_id].name }}
                              </RouterLink>
                            </div>

                            <!-- Мастер — внешние ссылки -->
                            <div v-if="suit.external_maker_links?.length" class="space-y-1">
                              <p v-if="!suit.maker_id || !makerGroupCache[suit.maker_id]"
                                class="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                                <BIcon name="Scissors" class="w-3 h-3" /> Мастер
                              </p>
                              <div class="flex flex-wrap gap-1.5">
                                <a v-for="link in suit.external_maker_links" :key="link"
                                  :href="link" target="_blank" rel="noopener noreferrer"
                                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-bg border border-brand-border text-white/70 hover:text-brand-accent hover:border-brand-accent/50 text-xs font-semibold transition-all"
                                  @click.stop>
                                  <BIcon name="ExternalLink" class="w-3 h-3" />
                                  {{ link.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0] }}
                                </a>
                              </div>
                            </div>

                            <div v-if="!suit.external_maker_links?.length && !suit.description && !(suit.maker_id && makerGroupCache[suit.maker_id])" class="py-2">
                              <p class="text-xs text-white/30 italic">Описание не добавлено</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>


                </div>
              </div>



              <!-- ── Content tabs as floating pills ──────────────────────── -->
              <div class="flex flex-wrap gap-2">
                <button v-for="tab in contentTabs" :key="tab.key"
                  v-show="tab.key !== 'followers' || isOwnProfile"
                  @click="activeContentTab = tab.key; loadTabData(tab.key)"
                  class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border transition-all duration-200 whitespace-nowrap"
                  :class="activeContentTab === tab.key
                    ? 'bg-brand-accent text-white border-brand-accent shadow-md shadow-brand-accent/25'
                    : 'bg-brand-card text-white/55 border-brand-border hover:border-brand-accent/50 hover:text-white'">
                  <component :is="tab.icon" class="w-4 h-4" />{{ tab.label }}
                </button>
              </div>

              <!-- ── Full post creator (MainLayout style) ──────────────── -->
              <div v-if="isOwnProfile && activeContentTab === 'posts'"
                class="bg-brand-card border rounded-3xl shadow-xl transition-colors"
                :class="showPostForm ? 'border-brand-accent/30' : 'border-brand-border'">
                <!-- Collapsed trigger -->
                <button v-if="!showPostForm" @click="showPostForm = true"
                  class="w-full flex items-center gap-3 px-5 py-4 text-left group">
                  <img :src="ownAvatarSrc || '/icons/badges/NN.jpg'" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover flex-shrink-0 group-hover:border-brand-accent/50 transition-colors" />
                  <span class="flex-1 text-sm text-white/55 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">Что нового?</span>
                  <div class="flex items-center gap-2 text-white/55 group-hover:text-white transition-colors ml-1">
                    <BIcon name="ImagePlus" class="w-5 h-5" />
                    <BIcon name="Hash" class="w-5 h-5" />
                  </div>
                </button>
                <!-- Expanded composer -->
                <div v-else class="p-5 space-y-4">
                  <div class="flex items-start gap-3">
                    <div class="relative flex-shrink-0 mt-0.5">
                      <img :src="ownAvatarSrc || '/icons/badges/NN.jpg'" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <MentionTextarea v-model="newPostContent" placeholder="Что у вас нового? Используйте @ для упоминаний" minHeight="90px" />
                    </div>
                    <button @click="createPost" :disabled="!newPostContent.trim() || isCreatingPost"
                      class="w-10 h-10 rounded-full flex items-center justify-center bg-brand-accent text-white hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-accent/25 flex-shrink-0 mt-0.5">
                      <BIcon v-if="isCreatingPost" name="Loader2" class="w-5 h-5 animate-spin" />
                      <BIcon v-else name="SendHorizontal" class="w-5 h-5" />
                    </button>
                  </div>
                  <!-- Media previews -->
                  <MediaUpload ref="profileMediaUploadRef" type="posts" :multiple="true" @uploaded="onProfileMediaUploaded" />

                  <!-- Tags row -->
                  <div v-if="newPostTags.length" class="flex flex-wrap gap-1.5">
                    <span v-for="tag in newPostTags" :key="tag"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-accent/15 border border-brand-accent/30 text-brand-accent text-xs font-semibold">
                      #{{ tag }}
                      <button @click="removeProfileTag(tag)" class="text-brand-accent/60 hover:text-brand-accent"><BIcon name="X" class="w-3 h-3" /></button>
                    </span>
                  </div>

                  <div class="border-t border-brand-border" />
                  <div class="flex items-center gap-2 flex-wrap">
                    <button @click="profileMediaUploadRef?.openPicker()"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/55 hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all">
                      <BIcon name="ImagePlus" class="w-4 h-4" /> Медиа
                    </button>
                    <!-- Tag input -->
                    <div class="relative inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-transparent hover:border-brand-border hover:bg-brand-bg transition-all">
                      <BIcon name="Hash" class="w-4 h-4 text-white/55 flex-shrink-0" />
                      <input type="text" v-model="newPostTagInput" @keydown.enter.prevent="addProfileTag"
                        placeholder="тег + Enter"
                        class="bg-transparent text-xs text-white placeholder-brand-muted outline-none w-24" />
                    </div>
                    <!-- Category -->
                    <select v-model="newPostCategory"
                      class="px-3 py-2 rounded-xl text-xs text-white/55 bg-transparent border border-transparent hover:border-brand-border hover:bg-brand-bg outline-none transition-all cursor-pointer">
                      <template v-for="c in profilePostCategories" :key="c.id || 'empty-cat'">
                        <option :value="c.id" class="bg-brand-card">{{ c.name }}</option>
                      </template>
                    </select>
                    <button @click="newPostIsNsfw = !newPostIsNsfw"
                      :disabled="!isNsfwAllowed"
                      :title="!isNsfwAllowed ? 'Недоступно до 18 лет' : ''"
                      class="px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                      :class="!isNsfwAllowed ? 'opacity-30 cursor-not-allowed border-transparent text-white/55' : newPostIsNsfw ? 'border-brand-error/60 text-brand-error bg-brand-error/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                      NSFW
                    </button>
                    <div class="flex-1" />
                    <!-- Visibility -->
                    <div class="relative">
                      <button @click.stop="showProfileVisibilityMenu = !showProfileVisibilityMenu"
                        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                        :class="newPostVisibility !== 'public' ? 'border-brand-accent/50 text-brand-accent bg-brand-accent/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                        <BIcon :name="newPostVisibility === 'subscriber_only' ? 'Users' : newPostVisibility === 'paid' ? 'DollarSign' : 'Globe2'" class="w-3.5 h-3.5" />
                        {{ newPostVisibility === 'subscriber_only' ? 'Только Подписчикам' : newPostVisibility === 'paid' ? 'Платный пост' : 'Видно всем' }}
                        <BIcon name="ChevronDown" class="w-3 h-3 opacity-60" />
                      </button>
                      <Transition name="slide">
                        <div v-if="showProfileVisibilityMenu" v-click-outside="() => showProfileVisibilityMenu = false"
                          class="absolute bottom-full left-0 mb-1.5 z-30 w-52 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1">
                          <button @click="newPostVisibility = 'public'; showProfileVisibilityMenu = false"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-brand-bg/60 transition-colors"
                            :class="newPostVisibility === 'public' ? 'text-brand-accent' : 'text-white'">
                            <BIcon name="Globe2" class="w-4 h-4 flex-shrink-0" /> Видно всем
                            <BIcon v-if="newPostVisibility === 'public'" name="Check" class="w-3.5 h-3.5 ml-auto text-brand-accent" />
                          </button>
                          <button @click="newPostVisibility = 'subscriber_only'; showProfileVisibilityMenu = false"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-brand-bg/60 transition-colors"
                            :class="newPostVisibility === 'subscriber_only' ? 'text-brand-accent' : 'text-white'">
                            <BIcon name="Users" class="w-4 h-4 flex-shrink-0" /> Только Подписчикам
                            <BIcon v-if="newPostVisibility === 'subscriber_only'" name="Check" class="w-3.5 h-3.5 ml-auto text-brand-accent" />
                          </button>
                          <button @click="newPostVisibility = 'paid'; showProfileVisibilityMenu = false"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-brand-bg/60 transition-colors"
                            :class="newPostVisibility === 'paid' ? 'text-brand-accent' : 'text-white'">
                            <BIcon name="DollarSign" class="w-4 h-4 flex-shrink-0" /> Платный пост
                            <BIcon v-if="newPostVisibility === 'paid'" name="Check" class="w-3.5 h-3.5 ml-auto text-brand-accent" />
                          </button>
                        </div>
                      </Transition>
                    </div>
                    <button @click="showPostForm = false; newPostContent = ''; newPostMediaUrls = []; newPostTags = []; newPostTagInput = ''; newPostCategory = ''; newPostVisibility = 'public'; profileMediaUploadRef?.clearAll()"
                      class="text-xs font-semibold text-white/55 hover:text-white transition-all">Отмена</button>
                  </div>
                </div>
              </div>

              <!-- ── Content card ──────────────────────────────────────── -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="p-4 space-y-3">

                  <!-- POSTS / REPAWS -->
                  <template v-if="['posts', 'repaws'].includes(activeContentTab)">

                    <!-- Pinned post -->
                    <div v-if="pinnedPost && activeContentTab === 'posts'">
                      <div class="flex items-center gap-2 text-xs text-white/55 font-semibold mb-2 px-1">
                        <BIcon name="Pin" class="w-3.5 h-3.5 text-brand-accent" /> {{ langStore.t.pinnedPost }}
                      </div>
                      <PostCard :post="pinnedPost" :is-own-profile="isOwnProfile"
                        :is-pinned-post-id="viewedProfile.pinned_post_id"
                        :ad-mode="false"
                        :initial-repawed="profilePostStatus[pinnedPost.id]?.repawed ?? false"
                        :initial-favourited="profilePostStatus[pinnedPost.id]?.favourited ?? false"
                        :initial-vote="profilePostStatus[pinnedPost.id]?.userVote ?? 0"
                        @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                    </div>

                    <!-- Skeleton -->
                    <div v-if="isLoadingTab" class="space-y-3">
                      <div v-for="n in 3" :key="n" class="h-28 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>

                    <!-- Posts empty → show repaws fallback, or CTA -->
                    <template v-else-if="activeContentTab === 'posts' && tabPosts.filter((p: any) => p.id !== viewedProfile.pinned_post_id).length === 0 && !pinnedPost">
                      <template v-if="repawsFallback.length">
                        <div class="flex items-center gap-2 text-xs text-white/55 font-semibold mb-1 px-1">
                          <BIcon name="Repeat2" class="w-3.5 h-3.5 text-brand-accent" /> Постов нет — показываем RePaws
                        </div>
                        <PostCard v-for="post in repawsFallback" :key="post.id"
                          :post="post" :is-own-profile="isOwnProfile"
                          :is-pinned-post-id="viewedProfile.pinned_post_id"
                          :show-repaw-label="true"
                          :group-context="(post as any).groupPosts?.[0]?.group ?? null"
                          :ad-mode="false"
                          :initial-repawed="profilePostStatus[post.id]?.repawed ?? false"
                          :initial-favourited="profilePostStatus[post.id]?.favourited ?? false"
                          :initial-vote="profilePostStatus[post.id]?.userVote ?? 0"
                          @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                      </template>
                      <div v-else class="py-14 text-center text-white/55">
                        <BIcon name="FileText" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p class="font-semibold text-sm mb-4">{{ langStore.t.noPostsLabel }}</p>
                        <button v-if="isOwnProfile" @click="showPostForm = true; $nextTick(() => window.scrollTo({top: 0, behavior: 'smooth'}))"
                          class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-brand-accent/20">
                          <BIcon name="Plus" class="w-4 h-4" /> Создать первый пост
                        </button>
                      </div>
                    </template>

                    <!-- Posts / repaws list -->
                    <template v-else>
                      <PostCard v-for="post in tabPosts.filter((p: any) => p.id !== viewedProfile.pinned_post_id)" :key="post.id"
                        :post="post" :is-own-profile="isOwnProfile"
                        :is-pinned-post-id="viewedProfile.pinned_post_id"
                        :show-repaw-label="activeContentTab === 'repaws'"
                        :group-context="activeContentTab === 'repaws' ? ((post as any).groupPosts?.[0]?.group ?? null) : null"
                        :ad-mode="false"
                        :initial-repawed="profilePostStatus[post.id]?.repawed ?? false"
                        :initial-favourited="profilePostStatus[post.id]?.favourited ?? false"
                        :initial-vote="profilePostStatus[post.id]?.userVote ?? 0"
                        @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                    </template>
                  </template>

                  <!-- MEDIA -->
                  <div v-else-if="activeContentTab === 'media'" @click="mediaTagTarget = null">
                    <!-- Панель фильтров + режим альбомов -->
                    <div class="flex items-center gap-2 mb-4 flex-wrap">
                      <button v-for="f in (['all','photo','video'] as const)" :key="f" @click="mediaFilter = f"
                        class="px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all"
                        :class="mediaFilter === f ? 'bg-brand-accent border-brand-accent text-white' : 'border-brand-border text-white/55 hover:text-white'">
                        {{ f === 'all' ? `Все · ${filteredMediaPosts.length}` : f === 'photo' ? `Фото · ${tabPosts.filter((p: any) => isImage(p.media_urls?.[0] ?? '')).length}` : `Видео · ${tabPosts.filter((p: any) => !isImage(p.media_urls?.[0] ?? '')).length}` }}
                      </button>
                      <div class="flex-1" />
                      <button @click.stop="mediaAlbumView = !mediaAlbumView"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all"
                        :class="mediaAlbumView ? 'bg-brand-accent/15 border-brand-accent/60 text-brand-accent' : 'border-brand-border text-white/55 hover:text-white'">
                        <BIcon name="FolderOpen" class="w-3.5 h-3.5" />
                        Альбомы
                      </button>
                    </div>

                    <!-- Скелетон при загрузке -->
                    <div v-if="isLoadingTab" class="grid grid-cols-3 gap-1.5">
                      <div v-for="n in 9" :key="n" class="aspect-square bg-brand-bg border border-brand-border rounded-xl animate-pulse"></div>
                    </div>

                    <!-- Пусто -->
                    <div v-else-if="!filteredMediaPosts.length && !specialAlbums.length" class="py-14 text-center text-white/55">
                      <BIcon name="Image" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm">Медиа пока нет</p>
                    </div>

                    <template v-else>
                      <!-- ══ Режим альбомов ══════════════════════════════════════ -->
                      <template v-if="mediaAlbumView">

                        <!-- Сетка карточек альбомов -->
                        <div class="grid grid-cols-2 gap-3">
                          <!-- Специальные альбомы (Фурсона / Фурсьют) -->
                          <div v-for="sp in specialAlbums" :key="sp.id"
                            @click.stop="openAlbum = sp"
                            class="relative rounded-2xl overflow-hidden cursor-pointer group aspect-[4/3] border border-brand-border hover:border-brand-accent/60 transition-all shadow-md">
                            <img v-if="sp.urls[0] && isImage(sp.urls[0].url)" :src="sp.urls[0].url"
                              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                            <div v-else class="w-full h-full bg-brand-bg flex items-center justify-center text-4xl">{{ sp.emoji }}</div>
                            <!-- Overlay -->
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                            <!-- Info -->
                            <div class="absolute bottom-0 left-0 right-0 p-3">
                              <div class="flex items-center gap-1.5 mb-0.5">
                                <span class="text-sm leading-none">{{ sp.emoji }}</span>
                                <p class="text-xs font-bold text-white">{{ sp.label }}</p>
                              </div>
                              <p class="text-[10px] text-white/55 font-semibold">{{ sp.urls.length }} фото</p>
                            </div>
                            <!-- Hover icon -->
                            <div class="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                              <BIcon name="FolderOpen" class="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                          <!-- Альбомы по месяцам -->
                          <div v-for="album in mediaAlbums" :key="album.label"
                            @click.stop="openAlbum = { ...album, emoji: undefined }"
                            class="relative rounded-2xl overflow-hidden cursor-pointer group aspect-[4/3] border border-brand-border hover:border-brand-accent/60 transition-all shadow-md">
                            <!-- Мозаика из первых 4 фото -->
                            <div v-if="album.urls.length >= 4" class="grid grid-cols-2 gap-0.5 w-full h-full">
                              <div v-for="(item, i) in album.urls.slice(0, 4)" :key="i" class="overflow-hidden">
                                <img v-if="isImage(item.url)" :src="item.url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                <div v-else class="w-full h-full bg-brand-bg/60 flex items-center justify-center"><BIcon name="Play" class="w-5 h-5 text-white/40" /></div>
                              </div>
                            </div>
                            <div v-else-if="album.urls[0]" class="w-full h-full">
                              <img v-if="isImage(album.urls[0].url)" :src="album.urls[0].url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                              <div v-else class="w-full h-full bg-brand-bg flex items-center justify-center"><BIcon name="Image" class="w-10 h-10 text-white/20" /></div>
                            </div>
                            <!-- Overlay -->
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
                            <!-- Info -->
                            <div class="absolute bottom-0 left-0 right-0 p-3">
                              <div class="flex items-center gap-1.5 mb-0.5">
                                <BIcon name="CalendarDays" class="w-3 h-3 text-brand-accent/80" />
                                <p class="text-xs font-bold text-white">{{ album.label }}</p>
                              </div>
                              <p class="text-[10px] text-white/55 font-semibold">{{ album.urls.length }} фото</p>
                            </div>
                            <!-- Hover icon -->
                            <div class="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                              <BIcon name="FolderOpen" class="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        </div>
                      </template>

                      <!-- ══ Обычная сетка ════════════════════════════════════════ -->
                      <div v-else class="grid grid-cols-3 gap-1.5">
                        <div v-for="(post, idx) in filteredMediaPosts" :key="post.id"
                          class="relative aspect-square rounded-xl overflow-hidden cursor-pointer group border border-brand-border/60 hover:border-brand-accent/60 bg-brand-bg transition-all">
                          <div @click.stop="openMediaLightbox(post.media_urls[0], filteredMediaPosts.map((p: any) => p.media_urls[0]), idx)"
                            class="absolute inset-0">
                            <img v-if="isImage(post.media_urls[0])" :src="post.media_urls[0]" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                            <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg/60">
                              <BIcon name="Play" class="w-8 h-8 text-white/55" />
                            </div>
                          </div>
                          <!-- Тег-ярлык -->
                          <div v-if="mediaPostLabels[post.id]"
                            class="absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-brand-accent/80 text-white backdrop-blur-sm pointer-events-none">
                            {{ mediaPostLabels[post.id] === 'fursona' ? '🐾' : '🦊' }}
                          </div>
                          <div v-if="post.media_urls.length > 1" class="absolute top-1.5 right-1.5 bg-black/70 rounded-lg px-1.5 py-0.5 text-[10px] text-white font-bold backdrop-blur-sm">+{{ post.media_urls.length - 1 }}</div>
                          <!-- Кнопка добавить в альбом (только свой профиль) -->
                          <button v-if="isOwnProfile" type="button"
                            @click.stop="mediaTagTarget = mediaTagTarget === post.id ? null : post.id"
                            class="absolute bottom-1 right-1 w-6 h-6 rounded-lg bg-black/60 border border-white/15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-brand-accent/70">
                            <BIcon name="FolderPlus" class="w-3 h-3 text-white" />
                          </button>
                          <!-- Попап выбора альбома -->
                          <div v-if="mediaTagTarget === post.id"
                            class="absolute bottom-8 right-1 z-20 flex flex-col gap-1 p-1.5 rounded-xl bg-brand-card border border-brand-border shadow-xl min-w-[100px]"
                            @click.stop>
                            <button @click.stop="setMediaLabel(post.id, 'fursona')"
                              class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-white/80 hover:bg-brand-accent/15 hover:text-brand-accent transition-all"
                              :class="mediaPostLabels[post.id] === 'fursona' ? 'bg-brand-accent/15 text-brand-accent' : ''">
                              🐾 Фурсона
                            </button>
                            <button @click.stop="setMediaLabel(post.id, 'fursuit')"
                              class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-white/80 hover:bg-brand-accent/15 hover:text-brand-accent transition-all"
                              :class="mediaPostLabels[post.id] === 'fursuit' ? 'bg-brand-accent/15 text-brand-accent' : ''">
                              🦊 Фурсьют
                            </button>
                            <button v-if="mediaPostLabels[post.id]" @click.stop="setMediaLabel(post.id, null)"
                              class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                              <BIcon name="X" class="w-3 h-3" /> Убрать
                            </button>
                          </div>
                          <div class="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                            <BIcon name="ZoomIn" class="w-6 h-6 text-white" />
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- FOLLOWERS (owner-only) -->
                  <div v-else-if="activeContentTab === 'followers'">
                    <div class="flex items-center gap-2 mb-3 px-1">
                      <BIcon name="Lock" class="w-3.5 h-3.5 text-white/30" />
                      <span class="text-xs text-white/30 font-semibold">Видно только тебе</span>
                    </div>
                    <div v-if="isLoadingTab" class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <div v-for="n in 6" :key="n" class="h-24 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>
                    <div v-else-if="!followers.length" class="py-14 text-center text-white/55">
                      <BIcon name="Users" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm mb-1">{{ langStore.t.noFollowersLabel }}</p>
                      <p class="text-xs opacity-70">Здесь появятся те, кто на тебя подписался</p>
                    </div>
                    <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <router-link v-for="follower in followers" :key="follower.id" :to="'/profile/' + follower.username"
                        class="flex flex-col items-center gap-2 p-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/50 transition-all group">
                        <img :src="follower.avatar_url || '/icons/badges/NN.jpg'" class="w-12 h-12 rounded-full object-cover" />
                        <div class="text-center min-w-0 w-full">
                          <p class="text-xs font-bold text-white truncate group-hover:text-brand-accent transition-colors">{{ follower.display_name || follower.username }}</p>
                          <p class="text-[10px] text-white/55 truncate">@{{ follower.username }}</p>
                        </div>
                      </router-link>
                    </div>
                  </div>

                </div>
              </div>

            </div>
            <!-- / CENTER COLUMN -->

            <!-- ── LIGHTBOX (глобальный) ──────────────────────────────── -->
            <Teleport to="body">
              <Transition name="lightbox-fade">
                <div v-if="lightboxUrl" class="fixed inset-0 z-[9999] flex items-center justify-center"
                  @click.self="closeLightbox" style="background:rgba(0,0,0,0.93)">
                  <button @click="closeLightbox"
                    class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-10 backdrop-blur-sm border border-white/15">
                    <BIcon name="X" class="w-5 h-5" />
                  </button>
                  <button v-if="lightboxIndex > 0" @click.stop="lightboxStep(-1)"
                    class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-10 backdrop-blur-sm border border-white/15">
                    <BIcon name="ChevronLeft" class="w-5 h-5" />
                  </button>
                  <button v-if="lightboxIndex < lightboxList.length - 1" @click.stop="lightboxStep(1)"
                    class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-10 backdrop-blur-sm border border-white/15">
                    <BIcon name="ChevronRight" class="w-5 h-5" />
                  </button>
                  <div class="max-w-[90vw] max-h-[90vh] flex items-center justify-center">
                    <img v-if="isImage(lightboxUrl)" :src="lightboxUrl"
                      class="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl select-none"
                      style="box-shadow:0 0 80px rgba(0,0,0,0.8)" draggable="false" />
                    <video v-else :src="lightboxUrl" controls class="max-w-full max-h-[90vh] rounded-2xl shadow-2xl"></video>
                  </div>
                  <div v-if="lightboxList.length > 1"
                    class="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-white/70 text-xs font-bold backdrop-blur-sm">
                    {{ lightboxIndex + 1 }} / {{ lightboxList.length }}
                  </div>
                </div>
              </Transition>
            </Teleport>

            <!-- ── RIGHT SIDEBAR ────────────────────────────────────────── -->
            <div class="hidden xl:flex flex-col gap-3 w-60 flex-shrink-0 sticky top-24 self-start">

              <!-- Stats -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-3">
                <div class="grid grid-cols-3 gap-1.5">
                  <button v-for="stat in profileStats" :key="stat.key"
                    @click="stat.tab ? (activeContentTab = stat.tab, loadTabData(stat.tab)) : null"
                    class="flex flex-col items-center gap-1 p-3 rounded-2xl bg-brand-bg/50 hover:bg-brand-bg border border-brand-border/50 hover:border-brand-accent/30 transition-all group cursor-pointer">
                    <span class="text-base font-extrabold text-white group-hover:text-brand-accent transition-colors leading-none">{{ stat.value }}</span>
                    <span class="text-[10px] text-white/55 font-medium text-center leading-tight">{{ stat.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Wallet card (own profile only) -->
              <div v-if="isOwnProfile" @click="showWalletModal = true"
                class="relative overflow-hidden bg-gradient-to-br from-brand-accent/15 to-brand-accent-plus/15 border border-brand-accent/25 hover:border-brand-accent/50 rounded-3xl shadow-xl p-4 cursor-pointer transition-all hover:scale-[1.01] group">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-xl bg-brand-accent/20 flex items-center justify-center">
                      <BIcon name="Wallet" class="w-3.5 h-3.5 text-brand-accent" />
                    </div>
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Кошелёк</p>
                  </div>
                  <BIcon name="ChevronRight" class="w-4 h-4 text-white/55 group-hover:text-brand-accent transition-colors" />
                </div>
                <div class="flex items-baseline gap-1.5">
                  <span class="text-2xl font-extrabold text-white leading-none">
                    {{ Number((viewedProfile as any)?.wallet?.balance ?? 0).toFixed(2) }}
                  </span>
                  <span class="text-xs font-semibold text-brand-accent-minus">Blooms</span>
                </div>
                <p class="text-[10px] text-white/55 mt-1">🌸 внутренняя валюта</p>
              </div>

              <!-- Info + Contacts merged card -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <BIcon name="Info" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Информация</p>
                  </div>
                  <button v-if="isOwnProfile" @click="openEditModal('contacts')"
                    class="w-6 h-6 flex items-center justify-center rounded-lg text-white/55 hover:text-brand-accent hover:bg-brand-bg transition-all">
                    <BIcon name="Pencil" class="w-3 h-3" />
                  </button>
                </div>
                <div class="px-2 pb-2 space-y-0.5">
                  <div v-if="viewedProfile.relationship_status" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Heart" class="w-4 h-4 text-pink-400 flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">Отношения</p>
                      <p class="text-xs text-brand-offwhite font-medium truncate">{{ { single: 'Свободен/а', in_relationship: 'В отношениях', relationship: 'В отношениях', married: 'В браке', complicated: 'Всё сложно', open: 'Открытые отношения', open_relationship: 'Открытые отношения', looking: 'В поиске', secret: 'Секрет' }[viewedProfile.relationship_status] ?? viewedProfile.relationship_status }}</p>
                      <div v-if="partnerProfile" class="flex items-center gap-1.5 mt-1">
                        <img v-if="partnerProfile.avatar_url" :src="partnerProfile.avatar_url" class="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                        <span class="text-[10px] text-pink-300 truncate">с {{ partnerProfile.display_name ?? partnerProfile.username }}</span>
                      </div>
                      <p v-if="togetherSince" class="text-[10px] text-white/55 mt-0.5">вместе {{ togetherSince }}</p>
                    </div>
                  </div>
                  <div v-if="viewedProfile.persona" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <span class="text-base leading-none flex-shrink-0">{{ personaEmoji(viewedProfile.persona) }}</span>
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">Фурсона</p>
                      <p class="text-xs text-brand-offwhite font-semibold truncate">{{ viewedProfile.persona }}</p>
                    </div>
                  </div>
                  <div v-if="viewedProfile.location || (viewedProfile as any).country" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="MapPin" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">Место</p>
                      <p class="text-xs text-brand-offwhite truncate">{{ placeStr }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Calendar" class="w-4 h-4 text-white/55 flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">На платформе с</p>
                      <p class="text-xs text-white/55">{{ joinDate }}</p>
                    </div>
                  </div>
                  <a v-if="viewedProfile.website" :href="viewedProfile.website" target="_blank" rel="noopener noreferrer"
                    class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all group">
                    <BIcon name="Link" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">Сайт</p>
                      <p class="text-xs text-brand-accent group-hover:underline truncate">{{ viewedProfile.website.replace(/^https?:\/\//, '') }}</p>
                    </div>
                  </a>
                </div>
              </div>

              <!-- Social links -->
              <div v-if="activeSocialLinks.length || isOwnProfile"
                class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <BIcon name="AtSign" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Соцсети</p>
                  </div>
                  <button v-if="isOwnProfile" @click="openEditModal('socials')"
                    class="w-6 h-6 flex items-center justify-center rounded-lg text-white/55 hover:text-brand-accent hover:bg-brand-bg transition-all">
                    <BIcon name="Pencil" class="w-3 h-3" />
                  </button>
                </div>
                <div v-if="activeSocialLinks.length" class="px-2 pb-2 space-y-0.5">
                  <a v-for="net in activeSocialLinks" :key="net.key"
                    :href="socialUrl(net.key, (viewedProfile as any).social_links[net.key])" target="_blank" rel="noopener noreferrer"
                    class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all group">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      :style="{ backgroundColor: net.color + '22' }">
                      <BIcon :name="net.iconName" class="w-3.5 h-3.5" :style="{ color: net.color }" />
                    </div>
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">{{ net.label }}</p>
                      <p class="text-xs text-brand-offwhite font-medium truncate group-hover:text-white">{{ (viewedProfile as any).social_links[net.key] }}</p>
                    </div>
                  </a>
                </div>
                <div v-else class="px-4 pb-4 text-center">
                  <p class="text-xs text-white/35">Соцсети не добавлены</p>
                  <button @click="openEditModal('socials')"
                    class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent border border-brand-accent/30 rounded-xl transition-all">
                    <BIcon name="Plus" class="w-3 h-3" /> Добавить
                  </button>
                </div>
              </div>

              <!-- Badges -->
              <div v-if="achievementBadges.length" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <button @click="showBadgesModal = true" class="w-full px-4 pt-3.5 pb-2 flex items-center justify-between hover:bg-brand-bg/30 transition-colors">
                  <div class="flex items-center gap-2">
                    <BIcon name="Award" class="w-3.5 h-3.5 text-yellow-400" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Значки</p>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-[11px] font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ achievementBadges.length }}</span>
                    <BIcon name="ChevronRight" class="w-3.5 h-3.5 text-white/55" />
                  </div>
                </button>
                <div class="px-2 pb-2 space-y-0.5">
                  <div v-for="badge in achievementBadges" :key="badge.key"
                    class="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-brand-bg/60 transition-all group cursor-default">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110" :class="badge.iconBg">
                      <component :is="badge.iconComp" class="w-3.5 h-3.5" :class="badge.iconColor" />
                    </div>
                    <div class="min-w-0">
                      <p class="text-xs font-bold text-white leading-tight truncate">{{ badge.label }}</p>
                      <p class="text-[10px] text-white/55 leading-tight mt-0.5 truncate">{{ badge.desc }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- TrustScore card (only for activity participants) -->
              <TrustScoreCard v-if="viewedProfile?.id" :user-id="viewedProfile.id" />

            </div>
            <!-- / RIGHT SIDEBAR -->

          </div>
          <!-- / TWO-COLUMN -->

        </template>
      </main>

    </div>

    <!-- ─── Story Viewer ─────────────────────────────────────────────── -->
    <StoryViewer
      v-if="profileStoryViewerOpen && profileStories.length"
      :groups="[profileStories]"
      :group-index="0"
      :story-index="0"
      @close="profileStoryViewerOpen = false"
    />

    <!-- ─── Avatar Viewer Modal ─────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showAvatarViewer" class="fixed inset-0 z-[600] bg-black/92 flex items-center justify-center p-4" @click.self="showAvatarViewer = false">
        <button @click="showAvatarViewer = false"
          class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-10">
          <BIcon name="X" class="w-5 h-5" />
        </button>
        <img :src="viewedProfile?.avatar_url" class="max-w-full max-h-[85vh] rounded-full object-cover shadow-2xl" />
      </div>
    </Transition>

    <!-- ─── Album Modal ────────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="openAlbum" class="fixed inset-0 z-[615] bg-black/95 flex flex-col" @click.self="openAlbum = null">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border/60 bg-brand-card/80 backdrop-blur-md flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <span v-if="openAlbum.emoji" class="text-xl leading-none">{{ openAlbum.emoji }}</span>
            <BIcon v-else name="CalendarDays" class="w-5 h-5 text-brand-accent" />
            <h3 class="text-white font-bold text-lg">{{ openAlbum.label }}</h3>
            <span class="text-xs text-white/40 font-semibold">· {{ openAlbum.urls.length }}</span>
          </div>
          <button @click="openAlbum = null"
            class="w-9 h-9 flex items-center justify-center rounded-xl bg-brand-bg hover:bg-brand-border text-white/70 hover:text-white transition-all">
            <BIcon name="X" class="w-4 h-4" />
          </button>
        </div>
        <!-- Grid -->
        <div class="flex-1 overflow-y-auto p-3">
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            <div v-for="(item, idx) in openAlbum.urls" :key="idx"
              @click.stop="openMediaLightbox(item.url, openAlbum!.urls.map(u => u.url), idx)"
              class="relative aspect-square rounded-xl overflow-hidden cursor-pointer group border border-brand-border/60 hover:border-brand-accent/60 bg-brand-bg transition-all">
              <img v-if="isImage(item.url)" :src="item.url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg/60">
                <BIcon name="Play" class="w-8 h-8 text-white/55" />
              </div>
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <BIcon name="ZoomIn" class="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Fursona Reference Viewer ─────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showFursonaRefViewer" class="fixed inset-0 z-[610] bg-black/92 flex items-center justify-center p-4" @click.self="showFursonaRefViewer = false">
        <div class="w-full max-w-6xl bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3 border-b border-brand-border bg-gradient-to-r from-brand-bg to-brand-card">
            <h3 class="text-white font-bold text-lg truncate">Референс {{ (viewedProfile as any)?.fursona_name || viewedProfile?.persona || viewedProfile?.display_name }}</h3>
            <button @click="showFursonaRefViewer = false"
              class="w-9 h-9 flex items-center justify-center rounded-xl bg-brand-bg hover:bg-brand-border text-white/70 hover:text-white transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="p-4 space-y-4">
            <div class="rounded-2xl overflow-hidden border border-brand-border bg-brand-bg">
              <img :src="activeFursonaRef" class="w-full max-h-[70vh] object-contain" alt="Референс фурсоны" />
            </div>
            <div class="flex flex-wrap gap-2">
              <span v-if="viewedProfile?.persona" class="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-border text-xs font-semibold text-white/80">{{ viewedProfile.persona }}</span>
              <span v-if="(viewedProfile as any)?.fursona_name" class="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-border text-xs font-semibold text-white/80">{{ (viewedProfile as any).fursona_name }}</span>
              <span v-if="viewedProfile?.pronouns" class="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-border text-xs font-semibold text-white/80">{{ viewedProfile.pronouns }}</span>
            </div>
            <div v-if="fursonaRefPalette.length" class="flex flex-wrap gap-2">
              <div v-for="c in fursonaRefPalette" :key="`modal-${c}`" class="px-2 py-1 rounded-lg bg-brand-bg border border-brand-border text-[11px] font-bold text-white/80 flex items-center gap-2">
                <span class="w-3.5 h-3.5 rounded-sm border border-black/30" :style="`background:${c}`"></span>
                {{ c }}
              </div>
            </div>
            <div v-if="fursonaRefImages.length > 1" class="flex gap-2 overflow-x-auto pb-1">
              <button v-for="img in fursonaRefImages" :key="`modal-thumb-${img}`" @click="selectFursonaRef(img)"
                class="w-16 h-16 rounded-xl overflow-hidden border flex-shrink-0 transition-all"
                :class="activeFursonaRef === img ? 'border-brand-accent' : 'border-brand-border hover:border-white/30'">
                <img :src="img" class="w-full h-full object-cover" alt="Миниатюра референса" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Banner Viewer Modal ─────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showBannerViewer" class="fixed inset-0 z-[600] bg-black/92 flex items-center justify-center p-4" @click.self="showBannerViewer = false">
        <button @click="showBannerViewer = false"
          class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-10">
          <BIcon name="X" class="w-5 h-5" />
        </button>
        <img :src="viewedProfile?.banner_url" class="max-w-full max-h-[85vh] rounded-3xl object-contain shadow-2xl" />
      </div>
    </Transition>

</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useAuthStore } from '@/stores/auth'
import { useUserStore, type UserProfile, type Fursona, type Fursuit } from '@/stores/user'
import { useLangStore } from '@/stores/lang'
import PostComments from '@/components/PostComments.vue'
import PostCard from '@/components/PostCard.vue'
import MentionTextarea from '@/components/MentionTextarea.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import CustomPlayer from '@/components/CustomPlayer.vue'
import BIcon from '@/components/BIcon.vue'
import SoonBadge from '@/components/groups/SoonBadge.vue'
import AppBadge from '@/components/shared/AppBadge.vue'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import StoryViewer from '@/components/StoryViewer.vue'
import api from '@/api'
import { PROFILE_THEMES, PROFILE_FRAMES } from '@/lib/utils'
import {
  User, Users, UserPlus, UserMinus, UserX,
  Bell, MessageSquare, Pencil, Pin, Trash2, MoreHorizontal,
  ChevronUp, ChevronDown, Repeat2, MessageCircle, Heart, HeartOff,
  Image, Hash, Search, MapPin, Calendar, Link, Briefcase,
  FileText, BookImage, Send, Play, X, ArrowLeft, Megaphone,
  Crown, Shield, Star, BadgeCheck, Flame, Sparkles, Award,
  Footprints, Smile, SmilePlus, AlertCircle,
  LogOut, Camera, Eye, EyeOff, Info, Globe,
  Rabbit, PawPrint, Plus, Check, Twitter, Instagram, Youtube, Twitch, Github, Quote,
  Wallet, ChevronRight, AtSign, ArrowUpRight
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const userStore = useUserStore()
const langStore = useLangStore()

import { useMessagesStore } from '@/stores/messages'
import { useGroupsStore, type SoonBadge as SoonBadgeType } from '@/stores/groups'
import { useNsfwMode } from '@/composables/useNsfwMode'
import TrustScoreCard from '@/components/TrustScoreCard.vue'
const messagesStore = useMessagesStore()
const groupsStore = useGroupsStore()

const profileSoonBadges = ref<SoonBadgeType[]>([])

async function loadProfileSoonBadges(userId: string) {
  try {
    await groupsStore.loadMySoonBadges(userId)
    profileSoonBadges.value = groupsStore.mySoonBadges
  } catch { profileSoonBadges.value = [] }
}

async function openChat() {
  if (!viewedProfile.value) return
  const convId = await messagesStore.openConversation(viewedProfile.value.id)
  messagesStore.activeId = convId
  router.push({ name: 'messages' })
}

const closeMenu = () => {}

const viewedProfile = ref<UserProfile | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

// ── SEO ───────────────────────────────────────────────────────────────────────
const BASE = 'https://bloomly.fun'
useHead({
  title: () => {
    if (!viewedProfile.value) return 'Bloomly'
    const name = viewedProfile.value.display_name || viewedProfile.value.username
    return `${name} (@${viewedProfile.value.username}) — Bloomly`
  },
  meta: [
    { name: 'robots', content: 'index, follow' },
    { name: 'description', content: () => {
        if (!viewedProfile.value) return 'Bloomly — творческая социальная сеть.'
        const name = viewedProfile.value.display_name || viewedProfile.value.username
        return (viewedProfile.value.bio)
          ? `${viewedProfile.value.bio.slice(0, 155)}…`
          : `Профиль ${name} на Bloomly — творческой социальной сети.`
      }
    },
    { property: 'og:type', content: 'profile' },
    { property: 'og:site_name', content: 'Bloomly' },
    { property: 'og:title', content: () => {
        if (!viewedProfile.value) return 'Bloomly'
        const name = viewedProfile.value.display_name || viewedProfile.value.username
        return `${name} (@${viewedProfile.value.username})`
      }
    },
    { property: 'og:description', content: () => {
        if (!viewedProfile.value) return ''
        const name = viewedProfile.value.display_name || viewedProfile.value.username
        return viewedProfile.value.bio?.slice(0, 200) || `Профиль ${name} на Bloomly.`
      }
    },
    { property: 'og:image', content: () => viewedProfile.value?.avatar_url || `${BASE}/og-default.png` },
    { property: 'og:url', content: () => `${BASE}/profile/${viewedProfile.value?.username || route.params.username}` },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: () => {
        if (!viewedProfile.value) return 'Bloomly'
        return `${viewedProfile.value.display_name || viewedProfile.value.username} (@${viewedProfile.value.username})`
      }
    },
    { name: 'twitter:image', content: () => viewedProfile.value?.avatar_url || `${BASE}/og-default.png` },
  ],
  link: [
    { rel: 'canonical', href: () => `${BASE}/profile/${viewedProfile.value?.username || route.params.username}` },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => {
        if (!viewedProfile.value) return ''
        const name = viewedProfile.value.display_name || viewedProfile.value.username
        return JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          name,
          url: `${BASE}/profile/${viewedProfile.value.username}`,
          description: viewedProfile.value.bio || '',
          ...(viewedProfile.value.avatar_url ? {
            image: { '@type': 'ImageObject', url: viewedProfile.value.avatar_url },
          } : {}),
        })
      },
    },
  ],
})

// ── Profile stories ───────────────────────────────────────────────────────────
interface ProfileStory {
  id: string
  image_url: string | null
  created_at: string
  expires_at: string
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}
const profileStories = ref<ProfileStory[]>([])
const profileStoryViewerOpen = ref(false)
const hasStory = computed(() => profileStories.value.length > 0)

async function fetchProfileStories(userId: string) {
  try {
    const res = await api.get(`/stories/user/${userId}`)
    if (res.data.success) {
      profileStories.value = res.data.data.stories as ProfileStory[]
    }
  } catch {}
}

function onAvatarClick() {
  if (hasStory.value) {
    profileStoryViewerOpen.value = true
  } else if (avatarSrc.value) {
    showAvatarViewer.value = true
  }
}

type AboutTab = 'about' | 'fursona' | 'fursuit'
type ContentTab = 'posts' | 'repaws' | 'media' | 'followers'

const aboutTab = ref<AboutTab>('about')
const activeContentTab = ref<ContentTab>('posts')
const tabPosts = ref<any[]>([])
const repawsFallback = ref<any[]>([])
const followers = ref<any[]>([])
const userHashtags = ref<{ name: string; count: number }[]>([])
const isLoadingTab = ref(false)
const profilePostStatus = reactive<Record<string, { repawed: boolean; favourited: boolean; userVote: 1 | -1 | 0 }>>({})
const expandedMediaPost = ref<any | null>(null)
const pinnedPost = ref<any | null>(null)
const mediaFilter = ref<'all' | 'photo' | 'video'>('all')
const mediaAlbumView = ref(false)
// postId → 'fursona' | 'fursuit' | null  (ярлыки для ручных альбомов)
const mediaPostLabels = ref<Record<string, 'fursona' | 'fursuit'>>({})
const mediaTagTarget = ref<string | null>(null) // postId с открытым попапом тегов
const openAlbum = ref<{ label: string; emoji?: string; urls: { url: string; postId?: string }[] } | null>(null)

// ── Fursona / fursuit для просматриваемого профиля ───────────────────────────
const profileFursona = ref<Fursona | null>(null)
const profileFursuits = ref<Fursuit[]>([])
const profileFursonaLoading = ref(false)
const profileFursuitsLoading = ref(false)
const makerGroupCache = ref<Record<string, { id: string; slug: string; name: string; avatar_url: string | null }>>({})


async function loadProfileFursona(userId: string) {
  profileFursonaLoading.value = true
  try {
    const res = await api.get(`/users/${userId}/fursona`)
    if (res.data.success) profileFursona.value = res.data.data.fursona ?? null
    else profileFursona.value = null
  } catch { profileFursona.value = null }
  finally { profileFursonaLoading.value = false }
}

async function loadProfileFursuits(userId: string) {
  profileFursuitsLoading.value = true
  try {
    const res = await api.get(`/users/${userId}/fursuits`)
    if (res.data.success) profileFursuits.value = res.data.data.fursuits ?? []
    else profileFursuits.value = []
    // Resolve maker_ids → group info (for pill badges)
    const uniqueIds = [...new Set(profileFursuits.value.filter(s => s.maker_id).map(s => s.maker_id!))]
    await Promise.all(uniqueIds.map(async (id) => {
      if (makerGroupCache.value[id]) return
      try {
        const gr = await api.get(`/groups/${id}`)
        if (gr.data.success && gr.data.data.group) {
          makerGroupCache.value[id] = gr.data.data.group
        }
      } catch { /* not a group or no access, skip */ }
    }))
  } catch { profileFursuits.value = [] }
  finally { profileFursuitsLoading.value = false }
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
const lightboxUrl = ref<string>('')
const lightboxList = ref<string[]>([])
const lightboxIndex = ref(0)

function openMediaLightbox(url: string, list: string[], idx: number) {
  lightboxUrl.value = url
  lightboxList.value = list
  lightboxIndex.value = idx
}
function closeLightbox() { lightboxUrl.value = '' }
function lightboxStep(dir: -1 | 1) {
  const next = lightboxIndex.value + dir
  if (next >= 0 && next < lightboxList.value.length) {
    lightboxIndex.value = next
    lightboxUrl.value = lightboxList.value[next]
  }
}
// Клавиши для lightbox
function onKeyDown(e: KeyboardEvent) {
  if (!lightboxUrl.value) return
  if (e.key === 'Escape') closeLightbox()
  if (e.key === 'ArrowLeft') lightboxStep(-1)
  if (e.key === 'ArrowRight') lightboxStep(1)
}

const relation = reactive({ aFollowsB: false, bFollowsA: false, friends: false })
const notifyPosts = ref(false)
const notifyLoading = ref(false)
const isTogglingFollow = ref(false)

const newPostContent = ref('')
const newPostMediaUrls = ref<string[]>([])
const newPostIsNsfw = ref(false)
const newPostTags = ref<string[]>([])
const newPostTagInput = ref('')
const newPostCategory = ref('')
const newPostVisibility = ref('public')
const showProfileVisibilityMenu = ref(false)
const isCreatingPost = ref(false)
const profileMediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)

const profilePostCategories = [
  { id: '', name: 'Категория' },
  { id: 'digital_art', name: 'Digital Art' },
  { id: 'photography', name: 'Photography' },
  { id: '3d', name: '3D' },
  { id: 'animation', name: 'Animation' },
  { id: 'writing', name: 'Writing' },
  { id: 'other', name: 'Other' },
]
function addProfileTag() {
  const t = newPostTagInput.value.trim().replace(/^#/, '')
  if (t && !newPostTags.value.includes(t)) newPostTags.value.push(t)
  newPostTagInput.value = ''
}
function removeProfileTag(tag: string) { newPostTags.value = newPostTags.value.filter(t => t !== tag) }

const partnerProfile = ref<{ id: string; username: string; display_name: string | null; avatar_url: string | null } | null>(null)

// ── Online status ─────────────────────────────────────────────────────────────
const isProfileOnline = ref(false)
async function fetchOnlineStatus(userId: string) {
  try {
    const res = await api.get(`/users/online?ids=${userId}`)
    if (res.data.success) isProfileOnline.value = !!res.data.data[userId]
  } catch {}
}

// ── NSFW (shared with AppHeader via v-model) ──────────────────────────────────
const { nsfwEnabled: nsfwMode } = useNsfwMode()

// ── Full post creator state ───────────────────────────────────────────────────
const showPostForm = ref(false)

// ── Edit modal ────────────────────────────────────────────────────────────────
const showEditModal = ref(false)
const showBadgesModal = ref(false)
const showWalletModal = ref(false)
const showAvatarViewer = ref(false)
const showBannerViewer = ref(false)
const showFursonaRefViewer = ref(false)
const selectedFursonaRef = ref('')
const fursonaSubTab = ref<'info' | 'personality' | 'features'>('personality')
const editSection = ref<'basics' | 'bio' | 'fursona' | 'fursuit' | 'contacts' | 'socials'>('bio')
const isSavingEdit = ref(false)
const editForm = ref<{
  display_name?: string; pronouns?: string; job_title?: string; artist_since?: string
  bio?: string; persona?: string; fursona_name?: string; fursona_gender?: string; fursona_description?: string; fursona_color?: string; fursona_photo_url?: string; likes?: string[]; dislikes?: string[]
  location?: string; country?: string; website?: string; relationship_status?: string
  accent_color?: string; social_links?: Record<string, string>
  has_fursuit?: boolean; fursuit_description?: string; fursuit_maker?: string
}>({})

const fursonaRefInput = ref<HTMLInputElement | null>(null)
const isUploadingRef = ref(false)

const todayISO = new Date().toISOString().slice(0, 10)

function openEditModal(section: 'basics' | 'bio' | 'fursona' | 'fursuit' | 'contacts' | 'socials') {
  // Map profile section → settings section ID
  const sectionMap: Record<string, string> = {
    basics:   'sec-basic',
    bio:      'sec-basic',
    fursona:  'sec-fursona',
    fursuit:  'sec-fursona',
    contacts: 'sec-contacts',
    socials:  'sec-contacts',
  }
  router.push({ name: 'settings-profile', query: { section: sectionMap[section] ?? 'sec-basic' } })
}

const fursonaRefImages = computed(() => {
  const p = viewedProfile.value as any
  if (!p) return [] as string[]
  return Array.from(new Set([
    p.fursona_photo_url,
    viewedProfile.value?.avatar_url,
    viewedProfile.value?.banner_url,
  ].filter((v): v is string => !!v)))
})

const activeFursonaRef = computed(() => selectedFursonaRef.value || fursonaRefImages.value[0] || '')
const fursonaOtherCount = computed(() => Math.max(0, fursonaRefImages.value.length - 1))

const fursonaViewTabs = computed(() => [
  { key: 'personality' as const, label: 'Личность', count: ((profileFursona.value?.likes?.length ?? 0) + (profileFursona.value?.dislikes?.length ?? 0)) },
  { key: 'info' as const,        label: 'Информация' },
  { key: 'features' as const,    label: 'Особенности', count: profileFursona.value?.colors?.length ?? 0 },
])

const fursonaRefPalette = computed(() => {
  const p = viewedProfile.value as any
  if (!p) return [] as string[]
  return Array.from(new Set([
    p.fursona_color,
    viewedProfile.value?.accent_color,
  ].filter((v): v is string => !!v && /^#[0-9A-Fa-f]{6}$/.test(v))))
})

function selectFursonaRef(url: string) {
  selectedFursonaRef.value = url
}

function openFursonaRef(url?: string) {
  const next = url ?? activeFursonaRef.value
  if (!next) return
  selectedFursonaRef.value = next
  showFursonaRefViewer.value = true
}

watch(fursonaRefImages, (list) => {
  if (!list.length) {
    selectedFursonaRef.value = ''
    return
  }
  if (!selectedFursonaRef.value || !list.includes(selectedFursonaRef.value)) {
    selectedFursonaRef.value = list[0]
  }
})

// ── Interests (manual) ────────────────────────────────────────────────────────
const newInterestText = ref('')
const showInterestInput = ref(false)

async function addManualInterest() {
  const text = newInterestText.value.trim()
  if (!text || !viewedProfile.value) return
  const current: string[] = (viewedProfile.value as any).interests ?? []
  if (current.includes(text)) { newInterestText.value = ''; return }
  const updated = [...current, text]
  await userStore.updateProfile({ interests: updated } as any)
  ;(viewedProfile.value as any).interests = updated
  newInterestText.value = ''
  showInterestInput.value = false
}
async function removeManualInterest(idx: number) {
  if (!viewedProfile.value) return
  const current: string[] = (viewedProfile.value as any).interests ?? []
  const updated = current.filter((_, i) => i !== idx)
  await userStore.updateProfile({ interests: updated } as any)
  ;(viewedProfile.value as any).interests = updated
}

async function saveEditModal() {
  isSavingEdit.value = true
  try {
    await userStore.updateProfile(editForm.value as any)
    await loadProfile()
    showEditModal.value = false
  } catch {} finally { isSavingEdit.value = false }
}

// ── S3 uploads ────────────────────────────────────────────────────────────────
const bannerFileInput = ref<HTMLInputElement | null>(null)
const avatarFileInput = ref<HTMLInputElement | null>(null)
const isUploadingBanner = ref(false)
const isUploadingAvatar = ref(false)

async function onBannerFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  isUploadingBanner.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=banners', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data.success && res.data.data?.url) {
      await userStore.updateProfile({ banner_url: res.data.data.url } as any)
      if (viewedProfile.value) viewedProfile.value.banner_url = res.data.data.url
    }
  } catch (err) { console.error('banner upload failed', err) }
  finally {
    isUploadingBanner.value = false
    if (bannerFileInput.value) bannerFileInput.value.value = ''
  }
}

async function onAvatarFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  isUploadingAvatar.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data.success && res.data.data?.url) {
      await userStore.updateProfile({ avatar_url: res.data.data.url } as any)
      if (viewedProfile.value) viewedProfile.value.avatar_url = res.data.data.url
      if (authStore.user) (authStore.user as any).avatar_url = res.data.data.url
    }
  } catch (err) { console.error('avatar upload failed', err) }
  finally {
    isUploadingAvatar.value = false
    if (avatarFileInput.value) avatarFileInput.value.value = ''
  }
}

async function onFursonaRefUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  isUploadingRef.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=posts', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data.success && res.data.data?.url) {
      editForm.value.fursona_photo_url = res.data.data.url
    }
  } catch (err) { console.error('fursona ref upload failed', err) }
  finally {
    isUploadingRef.value = false
    if (fursonaRefInput.value) fursonaRefInput.value.value = ''
  }
}

// ── Computed ──────────────────────────────────────────────────────────────────
const isOwnProfile = computed(() => !!authStore.user && authStore.user.id === viewedProfile.value?.id)
const groupsCount = computed(() => 0)

const profileDisplayName = computed(() => {
  return viewedProfile.value?.display_name || viewedProfile.value?.username || ''
})

const profileBio = computed(() => {
  return viewedProfile.value?.bio ?? ''
})

const ownAvatarSrc = computed(() => authStore.user?.avatar_url ?? '')

const ownJobTitle = computed(() => (authStore.user as any)?.job_title ?? '')

const avatarSrc = computed(() => {
  const p = viewedProfile.value
  if (!p) return ''
  return p.avatar_url ?? ''
})

const bannerStyle = computed(() => {
  const p = viewedProfile.value
  if (!p) return {}
  if (p.banner_url) return { backgroundImage: `url('${p.banner_url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
  // Use theme accent if set, otherwise profile accent_color
  const themeId = (p as any).profile_theme as string | undefined
  const themeAccent = themeId && PROFILE_THEMES[themeId] ? PROFILE_THEMES[themeId].accent : null
  const color = themeAccent ?? p.accent_color ?? '#4C67CF'
  return { background: `linear-gradient(135deg, ${color}55 0%, ${color}22 40%, #16192F 100%)` }
})

const avatarRingStyle = computed(() => {
  const p = viewedProfile.value
  const frameId = (p as any)?.profile_frame as string | undefined
  // Theme accent for default_ring / no frame
  const themeId = (p as any).profile_theme as string | undefined
  const themeAccent = themeId && PROFILE_THEMES[themeId] ? PROFILE_THEMES[themeId].accent : null
  const accentColor = themeAccent ?? p?.accent_color ?? '#4C67CF'
  const frameStyleMap: Record<string, Record<string, string>> = {
    none:         {},
    default_ring: { outline: `2px solid ${accentColor}80`, outlineOffset: '2px' },
    gold:         { outline: '2px solid #fbbf24', outlineOffset: '2px' },
    neon:         { outline: '2px solid #ec4899', outlineOffset: '2px', boxShadow: '0 0 14px 3px rgba(236,72,153,0.65)' },
    rainbow:      { outline: '2px solid transparent', outlineOffset: '2px', boxShadow: '0 0 0 2px #f97316, 0 0 0 4px #eab308, 0 0 0 6px #22c55e' },
    silver:       { outline: '2px solid #cbd5e1', outlineOffset: '2px' },
    fire:         { outline: '2px solid #f97316', outlineOffset: '2px', boxShadow: '0 0 14px 3px rgba(249,115,22,0.65)' },
  }
  if (frameId && frameStyleMap[frameId]) return frameStyleMap[frameId]
  return { borderColor: `${accentColor}80` }
})

const accentStyle = computed(() => {
  const color = viewedProfile.value?.accent_color ?? '#4C67CF'
  return { backgroundColor: `${color}25`, borderColor: `${color}60`, color }
})

// ── Persona species emoji map ────────────────────────────────────────────────
function personaEmoji(species: string): string {
  const s = (species ?? '').toLowerCase().trim()
  if (/fox|лис/.test(s))                      return '🦊'
  if (/wolf|волк/.test(s))                     return '🐺'
  if (/cat|кот|кошк/.test(s))                  return '🐱'
  if (/dragon|дракон/.test(s))                 return '🐲'
  if (/raccoon|енот/.test(s))                  return '🦝'
  if (/bear|медведь/.test(s))                  return '🐻'
  if (/panda|панда/.test(s))                   return '🐼'
  if (/rabbit|bunny|кролик|зайц/.test(s))     return '🐰'
  if (/deer|олень/.test(s))                    return '🦌'
  if (/dog|пёс|собак/.test(s))                 return '🐕'
  if (/otter|выдр/.test(s))                    return '🦦'
  if (/bird|птиц|raven|ворон/.test(s))         return '🦅'
  if (/snake|змей|змея/.test(s))               return '🐍'
  if (/bat|летучая/.test(s))                   return '🦇'
  if (/skunk|скунс/.test(s))                   return '🦨'
  if (/lion|лев/.test(s))                      return '🦁'
  if (/tiger|тигр/.test(s))                    return '🐯'
  if (/shark|акул/.test(s))                    return '🦈'
  if (/horse|лошадь|конь|пони/.test(s))        return '🐴'
  if (/frog|лягушк/.test(s))                   return '🐸'
  if (/hyena|гиена/.test(s))                   return '🐾'
  if (/cheetah|gepard|гепард/.test(s))         return '🐆'
  if (/leopard|леопард/.test(s))               return '🐆'
  if (/snow.*leopard|снежный/.test(s))         return '🐆'
  if (/lynx|рысь/.test(s))                     return '🐈'
  if (/ferret|хорек/.test(s))                  return '🐾'
  if (/mink|норк/.test(s))                     return '🦦'
  if (/rat|mouse|мышь|крыс/.test(s))           return '🐭'
  if (/squirrel|белк/.test(s))                 return '🐿️'
  if (/bovine|cow|бык|корова/.test(s))          return '🐄'
  return '🐾'
}

const accentStyleSubtle = computed(() => {
  const color = viewedProfile.value?.accent_color ?? '#4C67CF'
  return { backgroundColor: `${color}30`, borderColor: `${color}50`, color }
})

// Badge pill in banner
const badgePillMap: Record<string, { label: string; cls: string; icon: any }> = {
  admin:      { label: 'Администратор', cls: 'bg-amber-500/25 border border-amber-500/40 text-amber-300', icon: Crown },
  moderator:  { label: 'Модератор',     cls: 'bg-purple-500/25 border border-purple-500/40 text-purple-300', icon: Shield },
  creator:    { label: 'Криэйтор',      cls: 'bg-orange-500/25 border border-orange-500/40 text-orange-300', icon: Star },
  advertiser: { label: 'Рекламодатель', cls: 'bg-emerald-500/25 border border-emerald-500/40 text-emerald-300', icon: Megaphone },
  ad:         { label: 'Рекламодатель', cls: 'bg-amber-500/25 border border-amber-500/40 text-amber-400', icon: Megaphone },
}

const badgePillClass = computed(() => {
  const p = viewedProfile.value
  const bt = p?.badge_type ?? p?.role
  return badgePillMap[bt ?? '']?.cls ?? ''
})
const badgePillLabel = computed(() => {
  const p = viewedProfile.value
  const bt = p?.badge_type ?? p?.role
  return badgePillMap[bt ?? '']?.label ?? ''
})
const badgePillIcon = computed(() => {
  const p = viewedProfile.value
  const bt = p?.badge_type ?? p?.role
  return badgePillMap[bt ?? '']?.icon ?? User
})

// Follow button
const isMutual = computed(() => relation.aFollowsB && relation.bFollowsA)
const followBtnLabel = computed(() => {
  if (relation.aFollowsB) return langStore.t.unsubscribe
  if (relation.bFollowsA) return langStore.t.subscribeBack
  return langStore.t.subscribe
})
const followBtnIcon = computed(() => {
  if (relation.aFollowsB) return UserMinus
  return UserPlus
})
const followBtnClass = computed(() => {
  if (relation.aFollowsB)
    return 'bg-brand-card border border-brand-border text-white/55 hover:text-brand-error hover:border-brand-error/40'
  if (relation.bFollowsA)
    return 'bg-brand-accent/20 border border-brand-accent/50 text-brand-accent hover:bg-brand-accent hover:text-white shadow-sm'
  return 'bg-brand-accent hover:bg-brand-accent-plus text-white shadow-sm'
})

// About nav Items
const aboutNavs = computed(() => {
  const navs = [
    { key: 'about' as AboutTab,     label: langStore.t.aboutTab,    icon: User },
    { key: 'fursona' as AboutTab,   label: langStore.t.fursonaTab,  icon: Rabbit },
  ]
  if ((viewedProfile.value as any)?.has_fursuit) {
    navs.push({ key: 'fursuit' as AboutTab, label: langStore.t.fursuitTab, icon: PawPrint })
  }
  return navs
})

watch([aboutTab, viewedProfile], () => {
  if (aboutTab.value === 'fursuit' && !(viewedProfile.value as any)?.has_fursuit) {
    aboutTab.value = 'about'
  }
})

// Content tabs
const contentTabs = computed(() => [
  { key: 'posts' as ContentTab,     label: langStore.t.postsTab,     icon: FileText },
  { key: 'repaws' as ContentTab,    label: langStore.t.repawsTab,    icon: Repeat2 },
  { key: 'media' as ContentTab,     label: langStore.t.mediaTab,     icon: Image },
  { key: 'followers' as ContentTab, label: langStore.t.followersTab, icon: Users },
])

const profileStats = computed(() => {
  const p = viewedProfile.value
  if (!p) return []
  return [
    { key: 'followers', value: followers.value.length,   label: 'Подписчики', tab: null },
    { key: 'groups',    value: groupsCount.value,         label: 'Группы', tab: null },
    { key: 'followers', value: p._count?.followers ?? 0, label: 'Лайков', tab: null },
  ]
})

const achievementBadges = computed(() => {
  const badges: { key: string; label: string; desc: string; iconComp: any; iconBg: string; iconColor: string }[] = []
  const p = viewedProfile.value
  if (!p) return badges
  if (p.badge_type === 'admin')      badges.push({ key: 'admin',      label: 'Администратор',      desc: 'Управляет платформой',     iconComp: Crown,      iconBg: 'bg-amber-500/20',   iconColor: 'text-amber-400' })
  if (p.badge_type === 'moderator')  badges.push({ key: 'mod',        label: 'Модератор',           desc: 'Поддерживает порядок',     iconComp: Shield,     iconBg: 'bg-purple-500/20',  iconColor: 'text-purple-400' })
  if (p.badge_type === 'creator')    badges.push({ key: 'creator',    label: 'Топ контрибьютор',    desc: '100+ публикаций',          iconComp: Star,       iconBg: 'bg-orange-500/20',  iconColor: 'text-orange-400' })
  // Verification type specific badges
  const vt = (p as any).verification_type
  if (vt === 'artist')  badges.push({ key: 'artist',  label: 'Верифицированный художник', desc: 'Подтверждено модератором', iconComp: BadgeCheck, iconBg: 'bg-purple-500/20',  iconColor: 'text-purple-400' })
  else if (vt === 'master')  badges.push({ key: 'master',  label: 'Верифицированный мастер',  desc: 'Подтверждено модератором', iconComp: BadgeCheck, iconBg: 'bg-amber-500/20',   iconColor: 'text-amber-400' })
  else if (vt === 'event')   badges.push({ key: 'event',   label: 'Мероприятие',              desc: 'Подтверждено модератором', iconComp: BadgeCheck, iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400' })
  else if (p.badge_type === 'verified' || (p as any).is_verified)   badges.push({ key: 'verified',   label: 'Подтверждённая страница', desc: 'Верифицированный аккаунт', iconComp: BadgeCheck, iconBg: 'bg-blue-500/20',    iconColor: 'text-blue-400' })
  if (p.role === 'advertiser')       badges.push({ key: 'advertiser', label: 'Рекламодатель',       desc: 'Активный рекламодатель',   iconComp: Megaphone,  iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400' })
  if ((p._count?.posts ?? 0) >= 10)  badges.push({ key: 'active',     label: 'Активный автор',      desc: '10+ публикаций',           iconComp: Flame,      iconBg: 'bg-red-500/20',     iconColor: 'text-red-400' })
  if ((p._count?.followers ?? 0) >= 50) badges.push({ key: 'popular', label: 'Популярный',          desc: '50+ читателей',            iconComp: Sparkles,   iconBg: 'bg-yellow-500/20',  iconColor: 'text-yellow-400' })
  // Default badge for all
  if (!badges.length) badges.push({ key: 'furlite', label: 'FurLite',             desc: 'Подписчик с ' + joinDate.value,  iconComp: Award,    iconBg: 'bg-brand-accent/20', iconColor: 'text-brand-accent' })
  return badges
})

// ── Word cloud helpers ────────────────────────────────────────────────────────
const maxHashtagCount = computed(() =>
  userHashtags.value.length ? Math.max(...userHashtags.value.map(t => t.count)) : 1
)
function tagFontSize(count: number) {
  return Math.round(12 + 16 * (count / (maxHashtagCount.value || 1)))
}

// ── Social networks ───────────────────────────────────────────────────────────
const socialNetworks = [
  { key: 'telegram',    label: 'Telegram',    iconName: 'Send',          color: '#2AABEE' },
  { key: 'twitter',     label: 'X / Twitter', iconName: 'Twitter',       color: '#1DA1F2' },
  { key: 'instagram',   label: 'Instagram',   iconName: 'Instagram',     color: '#E4405F' },
  { key: 'youtube',     label: 'YouTube',     iconName: 'Youtube',       color: '#FF0000' },
  { key: 'twitch',      label: 'Twitch',      iconName: 'Twitch',        color: '#9146FF' },
  { key: 'furaffinity', label: 'FurAffinity', iconName: 'PawPrint',      color: '#FAAF3A' },
  { key: 'vk',          label: 'ВКонтакте',   iconName: 'Users',         color: '#4C75A3' },
  { key: 'discord',     label: 'Discord',     iconName: 'MessageCircle', color: '#7289DA' },
  { key: 'github',      label: 'GitHub',      iconName: 'Github',        color: '#6e8196' },
  { key: 'other',       label: 'Другое / Сайт', iconName: 'Globe',       color: '#6366f1' },
]
const activeSocialLinks = computed(() => {
  const sl = (viewedProfile.value as any)?.social_links ?? {}
  return socialNetworks.filter(n => sl[n.key])
})
function socialUrl(key: string, val: string) {
  if (key === 'other') return val.startsWith('http') ? val : 'https://' + val
  if (val.startsWith('http')) return val
  const map: Record<string, string> = { telegram: 'https://t.me/', twitter: 'https://x.com/', instagram: 'https://instagram.com/', youtube: 'https://youtube.com/@', twitch: 'https://twitch.tv/', furaffinity: 'https://www.furaffinity.net/user/', vk: 'https://vk.com/', discord: '', github: 'https://github.com/' }
  return (map[key] ?? '') + val
}

// ── NSFW age check ──────────────────────────────────────────────────────────
const isNsfwAllowed = computed(() => {
  const bd = (viewedProfile.value as any)?.birth_date
    ?? (authStore.user as any)?.birth_date
  if (!bd) return true // unknown age → allow (server-side guard is separate)
  const birthYear = new Date(bd)
  const now = new Date()
  let age = now.getFullYear() - birthYear.getFullYear()
  const m = now.getMonth() - birthYear.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birthYear.getDate())) age--
  return age >= 18
})

// ── Place string helper ───────────────────────────────────────────────────
const placeStr = computed(() => {
  const loc = viewedProfile.value?.location
  const ctr = (viewedProfile.value as any)?.country
  if (loc && ctr) return `${loc}, ${ctr}`
  return loc ?? ctr ?? ''
})

// ── Together-since duration ───────────────────────────────────────────────
const togetherSince = computed((): string | null => {
  const since = (viewedProfile.value as any)?.relationship_since
  if (!since) return null
  const start = new Date(since)
  const now   = new Date()
  let years  = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  let days   = now.getDate() - start.getDate()
  if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate() }
  if (months < 0) { years--; months += 12 }
  const parts: string[] = []
  if (years  > 0) parts.push(`${years} ${years  === 1 ? 'год' : years  < 5 ? 'года' : 'лет'}`)
  if (months > 0) parts.push(`${months} ${months === 1 ? 'месяц' : months < 5 ? 'месяца' : 'месяцев'}`)
  if (parts.length === 0) parts.push(`${Math.max(days, 1)} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`)
  return parts.join(' ')
})


// ── Fursona steps ─────────────────────────────────────────────────────────────
const fursonaSteps = computed(() => {
  const p = viewedProfile.value
  return [
    { label: 'Вид',      iconName: 'PawPrint', done: !!((p as any)?.persona) },
    { label: 'Характер', iconName: 'Heart',    done: !!((p as any)?.likes?.length || (p as any)?.dislikes?.length) },
    { label: 'Фото',     iconName: 'Camera',   done: false, locked: true },
    { label: 'Реф',      iconName: 'Image',    done: false, locked: true },
  ]
})

const filteredMediaPosts = computed(() => {
  if (mediaFilter.value === 'photo') return tabPosts.value.filter((p: any) => isImage(p.media_urls?.[0] ?? ''))
  if (mediaFilter.value === 'video') return tabPosts.value.filter((p: any) => !isImage(p.media_urls?.[0] ?? ''))
  return tabPosts.value
})

// ── Альбомы медиа (группировка по месяцу) ────────────────────────────────────
const mediaAlbums = computed(() => {
  const map = new Map<string, { url: string; created_at: string; postId?: string }[]>()
  for (const post of filteredMediaPosts.value as any[]) {
    const dt = new Date(post.created_at)
    const label = dt.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    if (!map.has(label)) map.set(label, [])
    for (const url of (post.media_urls ?? [])) {
      map.get(label)!.push({ url, created_at: post.created_at, postId: post.id })
    }
  }
  return Array.from(map.entries()).map(([label, urls]) => ({ label, urls }))
})

// ── Специальные альбомы (Фурсона, Фурсьют, + ярлыки из постов) ──────────────
const specialAlbums = computed(() => {
  const albums: { id: string; label: string; emoji: string; urls: { url: string; postId?: string }[] }[] = []

  // Альбом Фурсона
  const fursonaUrls: { url: string }[] = []
  if (profileFursona.value?.reference_image_url) {
    fursonaUrls.push({ url: profileFursona.value.reference_image_url })
  }
  // Посты помеченные как фурсона
  for (const post of filteredMediaPosts.value as any[]) {
    if (mediaPostLabels.value[post.id] === 'fursona') {
      for (const url of (post.media_urls ?? [])) fursonaUrls.push({ url, postId: post.id })
    }
  }
  if (fursonaUrls.length) albums.push({ id: 'fursona', label: 'Фурсона', emoji: '🐾', urls: fursonaUrls })

  // Альбом Фурсьют
  const fursuitUrls: { url: string }[] = []
  for (const suit of profileFursuits.value) {
    if (suit.image_url) fursuitUrls.push({ url: suit.image_url })
  }
  for (const post of filteredMediaPosts.value as any[]) {
    if (mediaPostLabels.value[post.id] === 'fursuit') {
      for (const url of (post.media_urls ?? [])) fursuitUrls.push({ url, postId: post.id })
    }
  }
  if (fursuitUrls.length) albums.push({ id: 'fursuit', label: 'Фурсьют', emoji: '🦊', urls: fursuitUrls })

  return albums
})

function loadMediaLabels(userId: string) {
  try {
    const raw = localStorage.getItem(`bloomly_mlabels_${userId}`)
    if (raw) mediaPostLabels.value = JSON.parse(raw)
  } catch { /* ignore */ }
}

function setMediaLabel(postId: string, label: 'fursona' | 'fursuit' | null) {
  if (label === null) {
    delete mediaPostLabels.value[postId]
  } else {
    mediaPostLabels.value[postId] = label
  }
  const uid = viewedProfile.value?.id
  if (uid) {
    try { localStorage.setItem(`bloomly_mlabels_${uid}`, JSON.stringify(mediaPostLabels.value)) } catch { /* ignore */ }
  }
  mediaTagTarget.value = null
}

const joinDate = computed(() => {
  if (!viewedProfile.value) return ''
  return new Date(viewedProfile.value.created_at).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string) {
  const date = new Date(d)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}с назад`
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч назад`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function isImage(url: string) {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
}

function onProfileMediaUploaded(urls: string[]) {
  newPostMediaUrls.value = urls
}

// ── Load profile ──────────────────────────────────────────────────────────────
async function loadProfile() {
  const slug = route.params.username as string
  isLoading.value = true
  error.value = null
  viewedProfile.value = null
  followers.value = []
  tabPosts.value = []
  pinnedPost.value = null
  partnerProfile.value = null
  Object.assign(relation, { aFollowsB: false, bFollowsA: false, friends: false })

  try {
    const result = await userStore.fetchProfile(slug)
    viewedProfile.value = result
    if (result) {
      const userId = result.id
      loadMediaLabels(userId)
      await Promise.all([
        loadFriends(userId),
        authStore.isAuthenticated && !isOwnProfile.value ? loadRelation(userId) : Promise.resolve(),
        fetchOnlineStatus(userId),
        (result as any).relationship_with ? loadPartnerProfile((result as any).relationship_with) : Promise.resolve(),
        loadProfileSoonBadges(userId),
        fetchProfileStories(userId),
        loadProfileFursona(userId),
        loadProfileFursuits(userId),
      ])
      if (result.pinnedPost) pinnedPost.value = result.pinnedPost
      await loadTabData('posts')
    }
  } catch {
    error.value = 'Не удалось загрузить профиль'
  } finally {
    isLoading.value = false
  }
}

async function loadFriends(userId: string) {
  try {
    const res = await api.get(`/follows/${userId}/followers`)
    if (res.data.success) followers.value = res.data.data.users
  } catch {}
}

async function loadPartnerProfile(partnerId: string) {
  try {
    const res = await api.get(`/users/${partnerId}`)
    if (res.data.success) partnerProfile.value = res.data.data.user
    else partnerProfile.value = null
  } catch { partnerProfile.value = null }
}

async function loadRelation(userId: string) {
  try {
    const [relRes, notifyRes] = await Promise.all([
      api.get(`/follows/${userId}/relation`),
      api.get(`/users/${userId}/notify-status`).catch(() => null),
    ])
    if (relRes.data.success) {
      relation.aFollowsB = relRes.data.data.aFollowsB
      relation.bFollowsA = relRes.data.data.bFollowsA
      relation.friends = relRes.data.data.friends
    }
    if (notifyRes?.data?.success) {
      notifyPosts.value = notifyRes.data.data.notifyPosts
    }
  } catch {}
}

async function toggleNotify() {
  if (!viewedProfile.value || !relation.aFollowsB || notifyLoading.value) return
  notifyLoading.value = true
  try {
    const res = await api.post(`/users/${viewedProfile.value.id}/notify-toggle`)
    if (res.data.success) notifyPosts.value = res.data.data.notifyPosts
  } catch { /* silent */ }
  finally { notifyLoading.value = false }
}

async function loadTabData(tab: string) {
  if (!viewedProfile.value) return
  const uid = viewedProfile.value.id
  isLoadingTab.value = true
  try {
    if (tab === 'posts') {
      const res = await api.get(`/posts/user/${uid}`)
      if (res.data.success) {
        tabPosts.value = res.data.data.posts
        // If no posts, load repaws as fallback
        if (!tabPosts.value.length) {
          try {
            const rep = await api.get(`/posts/user/${uid}/repaws`)
            if (rep.data.success) repawsFallback.value = rep.data.data.posts
          } catch { repawsFallback.value = [] }
        } else {
          repawsFallback.value = []
        }
      }
    } else if (tab === 'repaws') {
      const res = await api.get(`/posts/user/${uid}/repaws`)
      if (res.data.success) tabPosts.value = res.data.data.posts
    } else if (tab === 'media') {
      const res = await api.get(`/posts/user/${uid}/media`)
      if (res.data.success) tabPosts.value = res.data.data.posts
    } else if (tab === 'hashtags') {
      if (!tabPosts.value.length) {
        const res = await api.get(`/posts/user/${uid}`)
        if (res.data.success) tabPosts.value = res.data.data.posts
      }
      const tagMap: Record<string, number> = {}
      for (const post of tabPosts.value) {
        for (const pt of (post.tags ?? [])) {
          const name = pt.tag?.name ?? pt.name
          if (name) tagMap[name] = (tagMap[name] ?? 0) + 1
        }
      }
      userHashtags.value = Object.entries(tagMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    } else if (tab === 'likes') {
      const res = await api.get(`/posts/user/${uid}/likes`)
      if (res.data.success) tabPosts.value = res.data.data.posts
    } else if (tab === 'followers') {
      await loadFriends(uid)
    }
    // Fetch repaw/vote/favourite status for loaded posts
    if (['posts', 'repaws', 'media', 'likes'].includes(tab) && authStore.isAuthenticated && tabPosts.value.length) {
      const ids = tabPosts.value.map((p: any) => p.id).join(',')
      try {
        const st = await api.get(`/posts/status?ids=${ids}`)
        if (st.data.success) {
          for (const s of st.data.data) {
            profilePostStatus[s.id] = { repawed: s.repawed ?? false, favourited: s.favourited ?? false, userVote: s.userVote ?? 0 }
          }
        }
      } catch { /* non-critical */ }
    }
  } catch (e) {
    console.error('Failed to load tab', tab, e)
  } finally {
    isLoadingTab.value = false
  }
}

// ── Follow ────────────────────────────────────────────────────────────────────
async function toggleFollow() {
  if (!viewedProfile.value || isTogglingFollow.value) return
  isTogglingFollow.value = true
  try {
    const res = await api.post(`/follows/${viewedProfile.value.id}/toggle`, {})
    if (res.data.success) {
      relation.aFollowsB = res.data.data.following
      relation.friends = relation.aFollowsB && relation.bFollowsA
      if (viewedProfile.value._count) viewedProfile.value._count.followers += relation.aFollowsB ? 1 : -1
    }
  } catch (e) { console.error('follow toggle failed', e) }
  finally { isTogglingFollow.value = false }
}

// ── Pin / unpin ───────────────────────────────────────────────────────────────
async function pinPost(postId: string) {
  try {
    await api.put(`/users/me/pin/${postId}`, {})
    if (viewedProfile.value) {
      viewedProfile.value.pinned_post_id = postId
      pinnedPost.value = tabPosts.value.find((p) => p.id === postId) ?? null
    }
  } catch (e) { console.error('pin failed', e) }
}

async function unpinPost() {
  try {
    await api.delete('/users/me/pin')
    if (viewedProfile.value) { viewedProfile.value.pinned_post_id = null; pinnedPost.value = null }
  } catch (e) { console.error('unpin failed', e) }
}

// ── Create post ───────────────────────────────────────────────────────────────
async function createPost() {
  if (!newPostContent.value.trim() || isCreatingPost.value) return
  isCreatingPost.value = true
  try {
    const res = await api.post('/posts', {
      content: newPostContent.value.trim(),
      isNsfw: newPostIsNsfw.value,
      mediaUrls: newPostMediaUrls.value,
      tags: newPostTags.value,
      category: newPostCategory.value || undefined,
      visibility: newPostVisibility.value,
    })
    if (res.data.success) {
      tabPosts.value.unshift(res.data.data.post)
      newPostContent.value = ''
      newPostMediaUrls.value = []
      newPostIsNsfw.value = false
      newPostTags.value = []
      newPostTagInput.value = ''
      newPostCategory.value = ''
      newPostVisibility.value = 'public'
      profileMediaUploadRef.value?.clearAll()
      if (viewedProfile.value?._count) viewedProfile.value._count.posts++
    }
  } catch (e) { console.error('failed to create post', e) }
  finally { isCreatingPost.value = false }
}

function onPostDeleted(postId: string) {
  tabPosts.value = tabPosts.value.filter((p) => p.id !== postId)
  if (pinnedPost.value?.id === postId) pinnedPost.value = null
  if (viewedProfile.value?._count) viewedProfile.value._count.posts = Math.max(0, viewedProfile.value._count.posts - 1)
}

function onPostUpdated(post: any) {
  const idx = tabPosts.value.findIndex((p) => p.id === post.id)
  if (idx !== -1) tabPosts.value[idx] = { ...tabPosts.value[idx], ...post }
  if (pinnedPost.value?.id === post.id) pinnedPost.value = { ...pinnedPost.value, ...post }
}

onMounted(() => {
  loadProfile()
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
watch(() => route.params.username, () => { aboutTab.value = 'about'; activeContentTab.value = 'posts'; loadProfile() })
// stories are loaded inside loadProfile via fetchProfileStories

</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px) }

/* Lightbox overlay transition */
.lightbox-fade-enter-active, .lightbox-fade-leave-active { transition: opacity 0.2s ease }
.lightbox-fade-enter-from, .lightbox-fade-leave-to { opacity: 0 }

@keyframes fade-in {
  from { opacity: 0; transform: translateY(-4px) }
  to   { opacity: 1; transform: translateY(0) }
}
.animate-fade-in { animation: fade-in 0.3s ease forwards }

/* ── Story ring: animated rotating gradient around avatar ── */
@keyframes story-ring-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.story-ring-gradient {
  background: conic-gradient(#4C67CF, #a855f7, #ec4899, #f97316, #4C67CF);
  animation: story-ring-spin 3s linear infinite;
}
</style>
