<template>
    <AppHeader :show-back="true" v-model:nsfwMode="nsfwMode" />

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

    <div class="max-w-7xl mx-auto flex pt-16 md:pt-24 px-3 md:px-4 gap-4 md:gap-8">

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
                      <img v-if="viewedProfile.avatar_url" :src="avatarSrc"
                        class="w-full h-full object-cover"
                        width="128" height="128" fetchpriority="high" />
                      <div v-else class="w-full h-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-4xl">
                        {{ (viewedProfile.display_name || viewedProfile.username || '?')[0].toUpperCase() }}
                      </div>
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
                        <BIcon name="MessageSquare" class="w-4 h-4" /> Сообщение
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
                    <!-- Verification type SVG badge -->
                    <img v-if="(viewedProfile as any)?.is_verified && (viewedProfile as any)?.verification_type"
                      :src="`/icons/badges/${(viewedProfile as any).verification_type}.svg`"
                      class="w-6 h-6 flex-shrink-0"
                      :title="({ artist: 'Верифицированный художник', master: 'Верифицированный мастер', event: 'Мероприятие' } as Record<string, string>)[(viewedProfile as any).verification_type] || 'Верифицирован'" />
                    <img v-else-if="(viewedProfile as any)?.is_verified"
                      src="/icons/badges/verified.svg"
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
                    <span v-if="viewedProfile.pronouns" class="px-2.5 py-1 bg-brand-bg border border-brand-border rounded-lg text-xs font-semibold text-white/55">{{ viewedProfile.pronouns }}</span>
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

                    <template>

                    <!-- Bio (с кнопкой редактирования) -->
                    <div class="relative group/bio">
                      <div v-if="viewedProfile.bio"
                        class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl px-5 py-4 pr-12">
                        <p class="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{{ viewedProfile.bio }}</p>
                      </div>
                      <div v-else-if="isOwnProfile" class="flex flex-col items-center gap-2 py-6 text-center bg-brand-bg/30 rounded-2xl border border-dashed border-brand-border/60 cursor-pointer hover:border-brand-accent/40 transition-all"
                        @click="openEditModal('bio')">
                        <BIcon name="FileText" class="w-7 h-7 text-white/25" />
                        <p class="text-xs text-white/40">Добавить описание</p>
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

                    </template><!-- /v-else regular mode -->
                  </div>

                  <!-- Фурсона -->
                  <div v-else-if="aboutTab === 'fursona'" class="space-y-4">
                    <div class="rounded-3xl border border-brand-border bg-brand-card shadow-xl overflow-hidden">
                      <div class="px-5 py-4 border-b border-brand-border/70 bg-gradient-to-r from-brand-bg/70 to-transparent flex items-center justify-between gap-3">
                        <div class="min-w-0">
                          <p class="text-xs font-bold uppercase tracking-wider text-white/45 mb-1">Фурсона</p>
                          <p class="text-2xl md:text-3xl font-extrabold text-white truncate">{{ (viewedProfile as any).fursona_name || viewedProfile.persona || viewedProfile.display_name }}</p>
                          <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span v-if="viewedProfile.persona" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-brand-bg border border-brand-border text-white/85">{{ viewedProfile.persona }}</span>
                            <span v-if="viewedProfile.pronouns" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-bg border border-brand-border text-white/75">{{ viewedProfile.pronouns }}</span>
                            <span v-if="(viewedProfile as any).fursona_color" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-brand-bg border border-brand-border text-white/85 inline-flex items-center gap-1.5">
                              <span class="w-3 h-3 rounded-sm border border-black/30" :style="`background:${(viewedProfile as any).fursona_color}`"></span>
                              {{ (viewedProfile as any).fursona_color }}
                            </span>
                          </div>
                        </div>
                        <button v-if="isOwnProfile" @click="openEditModal('fursona')"
                          class="w-9 h-9 flex items-center justify-center rounded-xl bg-brand-bg border border-brand-border hover:border-brand-accent text-white/55 hover:text-brand-accent transition-all flex-shrink-0">
                          <BIcon name="Pencil" class="w-4 h-4" />
                        </button>
                      </div>

                      <div class="p-4 grid grid-cols-1 xl:grid-cols-[1.05fr_1.2fr] gap-4">
                        <div class="space-y-3">
                          <button v-if="fursonaRefImages.length" type="button"
                            class="w-full relative h-72 rounded-2xl overflow-hidden border border-brand-border/60 group shadow-lg"
                            @click="openFursonaRef()">
                            <img :src="activeFursonaRef" class="absolute inset-0 w-full h-full object-cover" alt="Референс фурсоны" />
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/15 group-hover:from-black/70 transition-all"></div>
                            <div class="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/45 border border-white/15 text-[10px] font-bold text-white/85 uppercase tracking-wider">
                              Reference
                            </div>
                            <div class="absolute bottom-4 left-4 right-4 text-left">
                              <p class="text-white font-bold text-base">Референс персонажа</p>
                              <p class="text-white/75 text-xs mt-1">Открыть в полном размере</p>
                            </div>
                          </button>
                          <div v-else class="h-72 rounded-2xl border-2 border-dashed border-brand-border/40 flex flex-col items-center justify-center text-center opacity-65">
                            <BIcon name="Image" class="w-8 h-8 text-white/55 mb-2" />
                            <p class="text-sm font-semibold text-white/55">Референс пока не добавлен</p>
                          </div>

                          <div v-if="fursonaRefImages.length" class="grid grid-cols-4 gap-2">
                            <button v-for="(img, idx) in fursonaRefImages" :key="img" type="button"
                              @click="selectFursonaRef(img)"
                              class="relative rounded-xl overflow-hidden border transition-all"
                              :class="activeFursonaRef === img ? 'border-brand-accent ring-1 ring-brand-accent/40' : 'border-brand-border hover:border-white/30'">
                              <img :src="img" class="w-full aspect-square object-cover" :alt="`Реф ${idx + 1}`" />
                            </button>
                          </div>

                          <div v-if="fursonaOtherCount > 0" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-bg border border-brand-border">
                            <div class="flex -space-x-2">
                              <img v-for="img in fursonaRefImages.slice(1, 5)" :key="`other-${img}`" :src="img" class="w-6 h-6 rounded-full border border-brand-card object-cover" alt="Другой персонаж" />
                            </div>
                            <span class="text-sm font-semibold text-white/85">Другие персонажи ({{ fursonaOtherCount }})</span>
                          </div>
                        </div>

                        <div class="rounded-2xl border border-brand-border/70 bg-brand-bg/40 p-4">
                          <div class="flex items-center gap-2 border-b border-brand-border/70 pb-3 overflow-x-auto scrollbar-hide">
                            <button v-for="tab in fursonaViewTabs" :key="tab.key" @click="fursonaSubTab = tab.key"
                              class="px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border inline-flex items-center gap-1.5"
                              :class="fursonaSubTab === tab.key
                                ? 'bg-brand-card text-white border-brand-border shadow-sm'
                                : tab.disabled
                                  ? 'text-white/35 border-transparent'
                                  : 'text-white/65 hover:text-white border-transparent hover:border-brand-border/50'">
                              <span>{{ tab.label }}</span>
                              <span v-if="tab.count !== undefined" class="text-[10px] px-1.5 py-0.5 rounded-md bg-black/20 border border-white/10">{{ tab.count }}</span>
                            </button>
                          </div>

                          <div class="pt-4 min-h-[16rem]">
                            <template v-if="fursonaSubTab === 'personality'">
                              <h3 class="text-xl md:text-2xl font-extrabold text-white mb-3">Характер</h3>
                              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div class="p-3 rounded-xl bg-brand-card border border-brand-success/25">
                                  <p class="text-base md:text-lg font-extrabold text-brand-success mb-2">Любит</p>
                                  <ul v-if="viewedProfile.likes.length" class="space-y-1.5">
                                    <li v-for="item in viewedProfile.likes" :key="`like-${item}`" class="text-white/90 text-sm md:text-base leading-tight">• {{ item }}</li>
                                  </ul>
                                  <p v-else class="text-white/45 text-sm">Не заполнено</p>
                                </div>
                                <div class="p-3 rounded-xl bg-brand-card border border-brand-error/25">
                                  <p class="text-base md:text-lg font-extrabold text-brand-error mb-2">Не любит</p>
                                  <ul v-if="viewedProfile.dislikes.length" class="space-y-1.5">
                                    <li v-for="item in viewedProfile.dislikes" :key="`dislike-${item}`" class="text-white/90 text-sm md:text-base leading-tight">• {{ item }}</li>
                                  </ul>
                                  <p v-else class="text-white/45 text-sm">Не заполнено</p>
                                </div>
                              </div>
                            </template>

                            <template v-else-if="fursonaSubTab === 'info'">
                              <div class="space-y-2 text-sm">
                                <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-brand-card border border-brand-border">
                                  <span class="text-white/55">Имя</span>
                                  <span class="font-semibold text-white truncate">{{ (viewedProfile as any).fursona_name || '—' }}</span>
                                </div>
                                <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-brand-card border border-brand-border">
                                  <span class="text-white/55">Вид</span>
                                  <span class="font-semibold text-white truncate">{{ viewedProfile.persona || '—' }}</span>
                                </div>
                                <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-brand-card border border-brand-border">
                                  <span class="text-white/55">Местоимения</span>
                                  <span class="font-semibold text-white truncate">{{ viewedProfile.pronouns || '—' }}</span>
                                </div>
                              </div>
                            </template>

                            <template v-else-if="fursonaSubTab === 'features'">
                              <div class="space-y-3">
                                <p class="text-xs font-bold uppercase tracking-wider text-white/55">Цвета персонажа</p>
                                <div v-if="fursonaRefPalette.length" class="flex flex-wrap gap-2">
                                  <div v-for="c in fursonaRefPalette" :key="c" class="px-2 py-1 rounded-lg bg-brand-card border border-brand-border text-[11px] font-bold text-white/80 flex items-center gap-2">
                                    <span class="w-3.5 h-3.5 rounded-sm border border-black/30" :style="`background:${c}`"></span>
                                    {{ c }}
                                  </div>
                                </div>
                                <p v-else class="text-white/45 text-sm">Цвета не указаны</p>
                              </div>
                            </template>

                            <template v-else>
                              <div class="space-y-3">
                                <p class="text-xs font-bold uppercase tracking-wider text-white/55">Медиа</p>
                                <button v-if="activeFursonaRef" @click="openFursonaRef()"
                                  class="w-full h-40 rounded-2xl overflow-hidden border border-brand-border relative group">
                                  <img :src="activeFursonaRef" class="absolute inset-0 w-full h-full object-cover" alt="Медиа фурсоны" />
                                  <div class="absolute inset-0 bg-black/45 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                    <span class="px-3 py-1.5 rounded-xl bg-black/45 border border-white/20 text-xs font-bold text-white">Открыть</span>
                                  </div>
                                </button>
                                <p v-else class="text-white/45 text-sm">Медиа не добавлено</p>
                              </div>
                            </template>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Фурсьют -->
                  <div v-else-if="aboutTab === 'fursuit'" class="space-y-5">
                    <div v-if="(viewedProfile as any).has_fursuit"
                      class="p-4 bg-brand-bg border border-brand-border/60 rounded-2xl space-y-3">
                      <div class="flex items-center justify-between gap-2">
                        <p class="text-[11px] font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
                          <span class="text-base">🐾</span> Фурсьют
                        </p>
                        <button v-if="isOwnProfile" @click="openEditModal('fursuit')"
                          class="w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-brand-accent hover:bg-brand-card border border-transparent hover:border-brand-border transition-all">
                          <BIcon name="Pencil" class="w-3 h-3" />
                        </button>
                      </div>
                      <div v-if="(viewedProfile as any).fursuit_photo_url"
                        class="rounded-xl overflow-hidden border border-brand-border/60">
                        <img :src="(viewedProfile as any).fursuit_photo_url"
                          class="w-full max-h-72 object-cover" alt="Фото фурсьюта" />
                      </div>
                      <p v-if="(viewedProfile as any).fursuit_description"
                        class="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                        {{ (viewedProfile as any).fursuit_description }}
                      </p>
                      <div v-if="(viewedProfile as any).fursuit_maker"
                        class="flex items-center gap-2 text-xs text-white/55">
                        <BIcon name="Scissors" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
                        <span class="font-semibold">Мастер:</span>
                        <span class="text-white/80">{{ (viewedProfile as any).fursuit_maker }}</span>
                      </div>
                    </div>
                    <div v-else class="flex flex-col items-center gap-3 py-8 bg-brand-bg/30 rounded-2xl border border-dashed border-brand-border text-center">
                      <span class="text-4xl opacity-30">🐾</span>
                      <p class="text-sm font-semibold text-white/55">Фурсьют не добавлен</p>
                      <button v-if="isOwnProfile" @click="openEditModal('fursuit')"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/30 text-brand-accent rounded-xl text-xs font-bold transition-all">
                        <BIcon name="Plus" class="w-3 h-3" /> Добавить фурсьют
                      </button>
                    </div>
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
                  <img v-if="ownAvatarSrc" :src="ownAvatarSrc" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover flex-shrink-0 group-hover:border-brand-accent/50 transition-colors" />
                  <div v-else class="w-10 h-10 rounded-full border-2 border-brand-border flex-shrink-0 group-hover:border-brand-accent/50 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold transition-colors">{{ (authStore.user?.display_name || authStore.user?.username || '?')[0].toUpperCase() }}</div>
                  <span class="flex-1 text-sm text-white/55 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">Что нового?</span>
                  <div class="flex items-center gap-2 text-white/55 group-hover:text-white transition-colors ml-1">
                    <BIcon name="ImagePlus" class="w-5 h-5" />
                    <BIcon name="Hash" class="w-5 h-5" />
                  </div>
                </button>
                <!-- Expanded composer -->
                <div v-else class="p-5 space-y-4">
                  <div class="flex items-start gap-3">
                    <img v-if="ownAvatarSrc" :src="ownAvatarSrc" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover flex-shrink-0 mt-0.5" />
                    <div v-else class="w-10 h-10 rounded-full border-2 border-brand-border flex-shrink-0 mt-0.5 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold">{{ (authStore.user?.display_name || authStore.user?.username || '?')[0].toUpperCase() }}</div>
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
                  <div class="border-t border-brand-border" />
                  <div class="flex items-center gap-2 flex-wrap">
                    <button @click="profileMediaUploadRef?.openPicker()"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/55 hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all">
                      <BIcon name="ImagePlus" class="w-4 h-4" /> Медиа
                    </button>
                    <button @click="newPostIsNsfw = !newPostIsNsfw"
                      :disabled="!isNsfwAllowed"
                      :title="!isNsfwAllowed ? 'Недоступно до 18 лет' : ''"
                      class="px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                      :class="!isNsfwAllowed ? 'opacity-30 cursor-not-allowed border-transparent text-white/55' : newPostIsNsfw ? 'border-brand-error/60 text-brand-error bg-brand-error/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                      NSFW
                    </button>
                    <div class="flex-1" />
                    <button @click="showPostForm = false; newPostContent = ''; newPostMediaUrls = []; profileMediaUploadRef?.clearAll()"
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
                        <BIcon name="Pin" class="w-3.5 h-3.5 text-brand-accent" /> Закреплённый пост
                      </div>
                      <PostCard :post="pinnedPost" :is-own-profile="isOwnProfile"
                        :is-pinned-post-id="viewedProfile.pinned_post_id"
                        :ad-mode="false"
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
                          @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                      </template>
                      <div v-else class="py-14 text-center text-white/55">
                        <BIcon name="FileText" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p class="font-semibold text-sm mb-4">Постов пока нет</p>
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
                        @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                    </template>
                  </template>

                  <!-- MEDIA -->
                  <div v-else-if="activeContentTab === 'media'">
                    <div class="flex gap-2 mb-4">
                      <button v-for="f in (['all','photo','video'] as const)" :key="f" @click="mediaFilter = f"
                        class="px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all"
                        :class="mediaFilter === f ? 'bg-brand-accent border-brand-accent text-white' : 'border-brand-border text-white/55 hover:text-white'">
                        {{ f === 'all' ? `Всё · ${tabPosts.length}` : f === 'photo' ? `Фото · ${tabPosts.filter((p: any) => isImage(p.media_urls[0])).length}` : `Видео · ${tabPosts.filter((p: any) => !isImage(p.media_urls[0])).length}` }}
                      </button>
                    </div>

                    <div v-if="isLoadingTab" class="grid grid-cols-3 gap-1.5">
                      <div v-for="n in 9" :key="n" class="aspect-square bg-brand-bg border border-brand-border rounded-xl animate-pulse"></div>
                    </div>
                    <div v-else-if="!filteredMediaPosts.length" class="py-14 text-center text-white/55">
                      <BIcon name="Image" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm">Медиа пока нет</p>
                    </div>
                    <div v-else class="grid grid-cols-3 gap-1.5">
                      <div v-for="post in filteredMediaPosts" :key="post.id"
                        @click="expandedMediaPost = expandedMediaPost?.id === post.id ? null : post"
                        class="relative aspect-square rounded-xl overflow-hidden cursor-pointer group border border-brand-border/60 hover:border-brand-accent/60 bg-brand-bg transition-all">
                        <img v-if="isImage(post.media_urls[0])" :src="post.media_urls[0]" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg">
                          <BIcon name="Play" class="w-8 h-8 text-white/55" />
                        </div>
                        <div v-if="post.media_urls.length > 1" class="absolute top-1.5 right-1.5 bg-black/70 rounded-lg px-1.5 py-0.5 text-[10px] text-white font-bold">+{{ post.media_urls.length - 1 }}</div>
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-end p-2 opacity-0 group-hover:opacity-100">
                          <span class="flex items-center gap-1 text-white text-xs font-bold">
                            <BIcon name="ChevronUp" class="w-3.5 h-3.5" />{{ post.rating }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Transition name="fade">
                      <div v-if="expandedMediaPost" class="mt-3 bg-brand-bg border border-brand-border rounded-2xl p-4">
                        <div class="flex items-center justify-between mb-3">
                          <span class="text-sm font-bold text-white/70">{{ formatDate(expandedMediaPost.created_at) }}</span>
                          <button @click="expandedMediaPost = null" class="w-7 h-7 flex items-center justify-center rounded-lg text-white/55 hover:text-white hover:bg-brand-border/50 transition">
                            <BIcon name="X" class="w-4 h-4" />
                          </button>
                        </div>
                        <p v-if="expandedMediaPost.content" class="text-sm text-white/80 mb-3 whitespace-pre-wrap">{{ expandedMediaPost.content }}</p>
                        <div class="grid gap-2" :class="expandedMediaPost.media_urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'">
                          <template v-for="(url, i) in expandedMediaPost.media_urls" :key="i">
                            <div class="rounded-xl overflow-hidden">
                              <CustomPlayer :src="url" />
                            </div>
                          </template>
                        </div>
                      </div>
                    </Transition>
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
                      <p class="font-semibold text-sm mb-1">Нет подписчиков</p>
                      <p class="text-xs opacity-70">Здесь появятся те, кто на тебя подписался</p>
                    </div>
                    <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <router-link v-for="follower in followers" :key="follower.id" :to="'/profile/' + follower.id"
                        class="flex flex-col items-center gap-2 p-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/50 transition-all group">
                        <img v-if="follower.avatar_url" :src="follower.avatar_url" class="w-12 h-12 rounded-full object-cover" />
                        <div v-else class="w-12 h-12 rounded-full bg-brand-accent/20 border border-brand-border flex items-center justify-center text-brand-accent font-bold text-lg">{{ (follower.display_name || follower.username || '?')[0].toUpperCase() }}</div>
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

              <!-- Mini media thumbnails -->
              <div v-if="tabPosts.filter((p: any) => p.media_urls?.length).length" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-3">
                <p class="text-[11px] font-bold uppercase tracking-widest text-white/55 mb-2 px-1">Медиа</p>
                <div class="grid grid-cols-3 gap-1">
                  <div v-for="p in tabPosts.filter((p: any) => p.media_urls?.length).slice(0, 9)" :key="p.id"
                    class="aspect-square rounded-lg overflow-hidden bg-brand-bg cursor-pointer hover:opacity-75 transition-opacity">
                    <img v-if="isImage(p.media_urls[0])" :src="p.media_urls[0]" class="w-full h-full object-cover" />
                    <div v-else class="w-full h-full flex items-center justify-center bg-brand-border/20">
                      <BIcon name="Play" class="w-4 h-4 text-white/55" />
                    </div>
                  </div>
                </div>
              </div>

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
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUserStore, type UserProfile } from '@/stores/user'
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
const expandedMediaPost = ref<any | null>(null)
const pinnedPost = ref<any | null>(null)
const mediaFilter = ref<'all' | 'photo' | 'video'>('all')

const relation = reactive({ aFollowsB: false, bFollowsA: false, friends: false })
const notifyPosts = ref(false)
const notifyLoading = ref(false)
const isTogglingFollow = ref(false)

const newPostContent = ref('')
const newPostMediaUrls = ref<string[]>([])
const newPostIsNsfw = ref(false)
const isCreatingPost = ref(false)
const profileMediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)

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
const fursonaSubTab = ref<'info' | 'personality' | 'features' | 'media'>('personality')
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
  { key: 'info' as const,        label: 'Информация' },
  { key: 'personality' as const, label: 'Личность', count: ((viewedProfile.value?.likes?.length ?? 0) + (viewedProfile.value?.dislikes?.length ?? 0)), disabled: false },
  { key: 'features' as const,    label: 'Особенности', count: fursonaRefPalette.value.length, disabled: false },
  { key: 'media' as const,       label: 'Медиа', count: fursonaRefImages.value.length, disabled: false },
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
  // Pro: custom background image from gallery
  if ((p as any).profile_bg_url) return { backgroundImage: `url('${(p as any).profile_bg_url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
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
  verified:   { label: 'Верификация',   cls: 'bg-blue-500/25 border border-blue-500/40 text-blue-300', icon: BadgeCheck },
  artist:     { label: 'Художник',      cls: 'bg-purple-500/25 border border-purple-500/40 text-purple-300', icon: BadgeCheck },
  master:     { label: 'Мастер',        cls: 'bg-amber-500/25 border border-amber-500/40 text-amber-300', icon: BadgeCheck },
  event:      { label: 'Мероприятие',   cls: 'bg-emerald-500/25 border border-emerald-500/40 text-emerald-300', icon: BadgeCheck },
  advertiser: { label: 'Рекламодатель', cls: 'bg-emerald-500/25 border border-emerald-500/40 text-emerald-300', icon: Megaphone },
  ad:         { label: 'Рекламодатель', cls: 'bg-amber-500/25 border border-amber-500/40 text-amber-400', icon: Megaphone },
}

const badgePillClass = computed(() => {
  const p = viewedProfile.value
  // Check verification_type first for specific badge styles
  const vt = (p as any)?.verification_type
  if (vt && badgePillMap[vt]) return badgePillMap[vt].cls
  if ((p as any)?.is_verified && !p?.badge_type) return badgePillMap['verified']?.cls ?? ''
  const bt = p?.badge_type ?? p?.role
  return badgePillMap[bt ?? '']?.cls ?? ''
})
const badgePillLabel = computed(() => {
  const p = viewedProfile.value
  const vt = (p as any)?.verification_type
  if (vt && badgePillMap[vt]) return badgePillMap[vt].label
  if ((p as any)?.is_verified && !p?.badge_type) return badgePillMap['verified']?.label ?? ''
  const bt = p?.badge_type ?? p?.role
  return badgePillMap[bt ?? '']?.label ?? ''
})
const badgePillIcon = computed(() => {
  const p = viewedProfile.value
  const vt = (p as any)?.verification_type
  if (vt && badgePillMap[vt]) return badgePillMap[vt].icon
  if ((p as any)?.is_verified && !p?.badge_type) return badgePillMap['verified']?.icon ?? User
  const bt = p?.badge_type ?? p?.role
  return badgePillMap[bt ?? '']?.icon ?? User
})

// Follow button
const isMutual = computed(() => relation.aFollowsB && relation.bFollowsA)
const followBtnLabel = computed(() => {
  if (relation.aFollowsB) return 'Отписаться'
  if (relation.bFollowsA) return 'Подписаться в ответ'
  return 'Подписаться'
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
    { key: 'about' as AboutTab,     label: 'О себе',    icon: User },
    { key: 'fursona' as AboutTab,   label: 'Фурсона',   icon: Rabbit },
  ]
  if ((viewedProfile.value as any)?.has_fursuit) {
    navs.push({ key: 'fursuit' as AboutTab, label: 'Фурсьют', icon: PawPrint })
  }
  return navs
})

watch([aboutTab, viewedProfile], () => {
  if (aboutTab.value === 'fursuit' && !(viewedProfile.value as any)?.has_fursuit) {
    aboutTab.value = 'about'
  }
})

// Content tabs
const contentTabs = [
  { key: 'posts' as ContentTab,    label: 'Посты',    icon: FileText },
  { key: 'repaws' as ContentTab,   label: 'RePaws',   icon: Repeat2 },
  { key: 'media' as ContentTab,    label: 'Медиа',    icon: Image },
  { key: 'followers' as ContentTab, label: 'Подписчики', icon: Users },
]

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
  if (mediaFilter.value === 'photo') return tabPosts.value.filter(p => isImage(p.media_urls?.[0] ?? ''))
  if (mediaFilter.value === 'video') return tabPosts.value.filter(p => !isImage(p.media_urls?.[0] ?? ''))
  return tabPosts.value
})

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
  const id = route.params.id as string
  isLoading.value = true
  error.value = null
  viewedProfile.value = null
  followers.value = []
  tabPosts.value = []
  pinnedPost.value = null
  partnerProfile.value = null
  Object.assign(relation, { aFollowsB: false, bFollowsA: false, friends: false })

  try {
    const result = await userStore.fetchProfile(id)
    viewedProfile.value = result
    if (result) {
      await Promise.all([
        loadFriends(id),
        authStore.isAuthenticated && !isOwnProfile.value ? loadRelation(id) : Promise.resolve(),
        fetchOnlineStatus(id),
        (result as any).relationship_with ? loadPartnerProfile((result as any).relationship_with) : Promise.resolve(),
        loadProfileSoonBadges(id),
        fetchProfileStories(id),
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
    const res = await api.post('/posts', { content: newPostContent.value.trim(), isNsfw: newPostIsNsfw.value, mediaUrls: newPostMediaUrls.value })
    if (res.data.success) {
      tabPosts.value.unshift(res.data.data.post)
      newPostContent.value = ''
      newPostMediaUrls.value = []
      newPostIsNsfw.value = false
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

onMounted(() => { loadProfile() })
watch(() => route.params.id, () => { aboutTab.value = 'about'; activeContentTab.value = 'posts'; loadProfile() })
// stories are loaded inside loadProfile via fetchProfileStories

</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px) }

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
