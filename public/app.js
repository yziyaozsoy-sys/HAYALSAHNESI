// HAYAL SAHNESİ - ANA MOTOR & OYNATICI SİSTEMİ
const API_BASE = '/api';
const globalAudio = document.getElementById('global-audio');
const readerBgAudio = document.getElementById('reader-bg-audio');
let ytPlayer = null;
let activeSourceType = 'none';
let isPlaying = false;
let allContents = [];
let currentStoryItem = null;
let activePhotoromanItem = null;
let activeSpotifyItem = null;

// --- PWA SERVICE WORKER & AKILLI YÜKLEME ---
let deferredPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW hatası:', err));
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

function handlePwaInstallClick() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
    });
  } else {
    openModal('modal-pwa-guide');
  }
}
window.handlePwaInstallClick = handlePwaInstallClick;

// --- KİŞİSEL KÜTÜPHANE / FAVORİLER SİSTEMİ ---
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('hayal_favorites') || '[]');
  } catch (e) {
    return [];
  }
}

function isFavorite(id) {
  return getFavorites().includes(String(id));
}

function toggleFavorite(id) {
  let favs = getFavorites();
  const sId = String(id);
  if (favs.includes(sId)) {
    favs = favs.filter(x => x !== sId);
  } else {
    favs.push(sId);
  }
  localStorage.setItem('hayal_favorites', JSON.stringify(favs));
  updateFavoriteCounter();
  updateFavoriteButtonStyles();
}

function updateFavoriteCounter() {
  const el = document.getElementById('fav-counter');
  if (el) el.innerText = getFavorites().length;
}

function updateFavoriteButtonStyles() {
  if (currentStoryItem) {
    const btn = document.getElementById('modal-story-fav-btn');
    if (btn) {
      const fav = isFavorite(currentStoryItem._id);
      btn.innerHTML = `<i class="fa-${fav ? 'solid' : 'regular'} fa-bookmark"></i>`;
      btn.className = fav 
        ? "w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center text-xs transition"
        : "w-8 h-8 rounded-xl bg-slate-900 border border-slate-700 text-rose-400 hover:bg-rose-600 hover:text-white transition flex items-center justify-center text-xs";
    }
  }
  if (activePhotoromanItem) {
    const btn = document.getElementById('reader-fav-btn');
    if (btn) {
      const fav = isFavorite(activePhotoromanItem._id);
      btn.innerHTML = `<i class="fa-${fav ? 'solid' : 'regular'} fa-bookmark"></i>`;
      btn.className = fav
        ? "w-8 h-8 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-xs transition"
        : "w-8 h-8 rounded-full bg-slate-900 border border-slate-700 text-amber-400 hover:bg-amber-500 hover:text-slate-950 transition flex items-center justify-center text-xs";
    }
  }
}

function toggleActiveStoryFavorite() {
  if (!currentStoryItem) return;
  toggleFavorite(currentStoryItem._id);
}
window.toggleActiveStoryFavorite = toggleActiveStoryFavorite;

function toggleActivePhotoromanFavorite() {
  if (!activePhotoromanItem) return;
  toggleFavorite(activePhotoromanItem._id);
}
window.toggleActivePhotoromanFavorite = toggleActivePhotoromanFavorite;

function openFavoritesModal() {
  const favIds = getFavorites();
  const listEl = document.getElementById('favorites-list');
  
  if (!favIds || favIds.length === 0) {
    listEl.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-6">Kütüphanenizde henüz kayıtlı bir eser bulunmuyor.</p>`;
    openModal('modal-favorites');
    return;
  }

  const favItems = allContents.filter(item => favIds.includes(String(item._id)));

  if (favItems.length === 0) {
    listEl.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-6">Kaydettiğiniz eserler bulunamadı veya yayından kaldırılmış olabilir.</p>`;
  } else {
    listEl.innerHTML = favItems.map(item => `
      <div class="card-stage p-3.5 rounded-2xl flex items-center justify-between border border-white/5 hover:border-rose-500/30 transition">
        <div class="truncate pr-3">
          <span class="text-[10px] font-bold text-rose-400 uppercase">${escapeHtml(item.type)}</span>
          <h4 class="font-bold text-white text-sm truncate">${escapeHtml(item.title)}</h4>
          <p class="text-[11px] text-slate-300 truncate">${escapeHtml(item.author || 'Hayal Sahnesi')}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="launchFavoriteItem('${item._id}')" class="bg-rose-600/20 hover:bg-rose-600 text-rose-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1">
            Görüntüle
          </button>
          <button onclick="toggleFavorite('${item._id}'); openFavoritesModal();" title="Kaldır" class="text-slate-500 hover:text-rose-400 p-1.5 transition">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  openModal('modal-favorites');
}
window.openFavoritesModal = openFavoritesModal;

function launchFavoriteItem(id) {
  closeModal('modal-favorites');
  const item = allContents.find(c => String(c._id) === String(id));
  if (!item) return;

  if (item.type === 'photoroman') {
    launchPhotoromanById(item._id);
  } else if (item.type === 'music' && item.mediaUrl && item.mediaUrl.includes('spotify.com')) {
    openSpotifyModal(item.title, item.author, item.mediaUrl, item._id);
  } else if (item.type === 'series') {
    openVideoPlayer(item.title, item.author, item.mediaUrl || '');
  } else {
    openInteractionsById(item._id);
  }
}
window.launchFavoriteItem = launchFavoriteItem;

// --- KATEGORİ GEZİNTİSİ ---
function switchCategory(cat) {
  const panels = document.querySelectorAll('.category-panel');
  panels.forEach(p => p.classList.add('hidden'));

  const activePanel = document.getElementById(`panel-${cat}`);
  if (activePanel) activePanel.classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  const activeBtn = document.getElementById(`tab-${cat}`);
  if (activeBtn) activeBtn.classList.add('active');

  window.scrollTo({ top: 140, behavior: 'smooth' });
}
window.switchCategory = switchCategory;

// --- OYNATMA HIZI KONTROLÜ ---
const availableSpeeds = [0.75, 1.0, 1.25, 1.5];
let currentSpeedIndex = 1;

function cycleAudioSpeed() {
  currentSpeedIndex = (currentSpeedIndex + 1) % availableSpeeds.length;
  const speed = availableSpeeds[currentSpeedIndex];

  if (globalAudio) globalAudio.playbackRate = speed;
  if (readerBgAudio) readerBgAudio.playbackRate = speed;
  if (ytPlayer && typeof ytPlayer.setPlaybackRate === 'function') {
    ytPlayer.setPlaybackRate(speed);
  }

  const speedBtn = document.getElementById('player-speed-btn');
  if (speedBtn) speedBtn.innerText = `${speed}x`;
}
window.cycleAudioSpeed = cycleAudioSpeed;

// --- OKUYUCU METİN BOYUTU ---
let currentFontSize = 18;
function adjustFontSize(delta) {
  currentFontSize = Math.min(Math.max(14, currentFontSize + delta), 28);
  const bodyEl = document.getElementById('story-body');
  const indEl = document.getElementById('font-size-indicator');
  if (bodyEl) bodyEl.style.fontSize = `${currentFontSize}px`;
  if (indEl) indEl.innerText = `${currentFontSize}px`;
}
window.adjustFontSize = adjustFontSize;

// --- SPOTIFY MODAL ---
function getSpotifyEmbedUrl(url) {
  if (!url) return '';
  const match = url.match(/open\.spotify\.com\/(track|album|artist|playlist|episode)\/([a-zA-Z0-9]+)/);
  if (match) {
    return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
  }
  return '';
}

function openSpotifyModal(title, author, url, id) {
  const embedUrl = getSpotifyEmbedUrl(url);
  if (!embedUrl) return;

  activeSpotifyItem = allContents.find(c => String(c._id) === String(id));
  document.getElementById('spotify-title').innerText = title;
  document.getElementById('spotify-author').innerText = author || 'Hayal Sahnesi';

  const container = document.getElementById('spotify-iframe-container');
  container.innerHTML = `
    <iframe style="border-radius:16px" src="${embedUrl}" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
  `;
  openModal('modal-spotify');
}
window.openSpotifyModal = openSpotifyModal;

function openInteractionsForActiveSpotify() {
  if (activeSpotifyItem) {
    closeModal('modal-spotify');
    openStoryWithInteractions(activeSpotifyItem);
  }
}
window.openInteractionsForActiveSpotify = openInteractionsForActiveSpotify;

// --- ULTRA HIZLI RESİM LAZY LOADING ---
function initLazyImages() {
  const lazyImages = document.querySelectorAll('img[data-src]');
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          img.onload = () => {
            img.classList.remove('opacity-0');
            img.classList.add('opacity-100');
          };
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '120px 0px' });

    lazyImages.forEach(img => imageObserver.observe(img));
  } else {
    lazyImages.forEach(img => {
      img.src = img.dataset.src;
      img.classList.remove('opacity-0');
    });
  }
}

// --- BEĞENİ VE YORUMLAR ---
function openInteractionsById(id) {
  const item = allContents.find(c => String(c._id) === String(id));
  if (!item) return;
  openStoryWithInteractions(item);
}
window.openInteractionsById = openInteractionsById;

function openStoryWithInteractions(item) {
  currentStoryItem = item;
  document.getElementById('story-title').innerText = item.title;
  document.getElementById('story-author').innerText = 'Yazar / Şair: ' + (item.author || 'Anonim');
  document.getElementById('story-body').innerText = item.textBody || item.description || 'Eser içeriği bulunamadı.';
  
  document.getElementById('modal-like-count').innerText = item.likes || 0;
  document.getElementById('modal-dislike-count').innerText = item.dislikes || 0;

  updateFavoriteButtonStyles();
  loadComments(item._id);
  openModal('modal-story');
}

async function handleReaction(action) {
  if (!currentStoryItem) return;
  const id = currentStoryItem._id;
  const key = `reacted_${id}`;

  if (localStorage.getItem(key)) {
    alert('Bu eser için zaten oy kullandınız.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/contents/${id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem(key, action);
      currentStoryItem.likes = data.likes;
      currentStoryItem.dislikes = data.dislikes;
      document.getElementById('modal-like-count').innerText = data.likes;
      document.getElementById('modal-dislike-count').innerText = data.dislikes;
      
      const rLikes = document.getElementById('reader-like-count');
      const rDislikes = document.getElementById('reader-dislike-count');
      if (rLikes) rLikes.innerText = data.likes;
      if (rDislikes) rDislikes.innerText = data.dislikes;
    }
  } catch (err) {
    alert('Oylama sunucuya iletilemedi.');
  }
}
window.handleReaction = handleReaction;

function handleReaderReaction(action) {
  if (!activePhotoromanItem) return;
  currentStoryItem = activePhotoromanItem;
  handleReaction(action);
}
window.handleReaderReaction = handleReaderReaction;

function openCommentsForCurrentPhotoroman() {
  if (activePhotoromanItem) {
    openStoryWithInteractions(activePhotoromanItem);
  }
}
window.openCommentsForCurrentPhotoroman = openCommentsForCurrentPhotoroman;

async function loadComments(contentId) {
  const listEl = document.getElementById('comment-list');
  const countEl = document.getElementById('comment-count');
  listEl.innerHTML = `<p class="text-xs text-slate-500 italic">Yorumlar yükleniyor...</p>`;

  try {
    const res = await fetch(`${API_BASE}/contents/${contentId}/comments`);
    const data = await res.json();
    const comments = data.comments || [];
    countEl.innerText = comments.length;

    if (comments.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-slate-500 italic">Henüz yorum yapılmamış. İlk yorumu siz yapın!</p>`;
      return;
    }

    listEl.innerHTML = comments.map(c => `
      <div class="p-3 bg-slate-900/80 rounded-xl border border-white/5 space-y-1">
        <div class="flex items-center justify-between text-[11px]">
          <span class="font-bold text-rose-400">${escapeHtml(c.authorName)}</span>
          <span class="text-slate-500">${new Date(c.createdAt).toLocaleDateString('tr-TR')}</span>
        </div>
        <p class="text-xs text-slate-200">${escapeHtml(c.commentText)}</p>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = `<p class="text-xs text-rose-400">Yorumlar alınamadı.</p>`;
  }
}

async function submitComment(e) {
  e.preventDefault();
  if (!currentStoryItem) return;

  const author = document.getElementById('comment-author').value.trim();
  const text = document.getElementById('comment-text').value.trim();
  const btn = document.getElementById('btn-comment-submit');

  btn.disabled = true;
  btn.innerText = 'İnceleniyor...';

  try {
    const res = await fetch(`${API_BASE}/contents/${currentStoryItem._id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorName: author, commentText: text })
    });
    const data = await res.json();

    if (data.success) {
      alert('✓ Yorumunuz onaylandı ve sahnede yerini aldı!');
      document.getElementById('comment-text').value = '';
      loadComments(currentStoryItem._id);
    } else {
      alert(data.message || 'Yorum kabul edilmedi.');
    }
  } catch (err) {
    alert('Sunucu hatası oluştu.');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Yorumu Sahnele';
  }
}
window.submitComment = submitComment;

// --- SKELETON GÖSTERİCİ & İÇERİK YÜKLEME ---
function showAllSkeletons() {
  const gridIds = ['showcase-grid', 'poem-grid', 'story-grid', 'photoroman-grid', 'series-grid', 'music-grid'];
  const skeletonHtml = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  gridIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = skeletonHtml;
  });
}

async function loadLiveContents() {
  showAllSkeletons();
  try {
    const res = await fetch(`${API_BASE}/contents`);
    const json = await res.json();
    allContents = Array.isArray(json) ? json : (json.data || []);
    distributeLiveContents(allContents);
    requestAnimationFrame(() => {
      initLazyImages();
    });
  } catch (err) {
    console.warn('API yükleme hatası:', err);
  }
}

function distributeLiveContents(items) {
  // 0. Vitrin
  const showcaseGrid = document.getElementById('showcase-grid');
  if (showcaseGrid) {
    showcaseGrid.innerHTML = items.slice(0, 6).map(it => createShowcaseCard(it)).join('');
  }

  // 1. Şiirler
  const poems = items.filter(x => x.type === 'poem');
  const poemGrid = document.getElementById('poem-grid');
  if (poemGrid) {
    poemGrid.innerHTML = poems.map(p => {
      const isSpotify = p.mediaUrl && p.mediaUrl.includes('spotify.com');
      return `
        <div class="card-stage rounded-2xl p-5 hover:border-rose-500/40 transition flex flex-col justify-between border border-rose-900/30 gap-4">
          <div class="space-y-2.5">
            <div class="flex items-center justify-between text-xs text-rose-400 font-semibold">
              <span><i class="fa-solid fa-feather mr-1"></i>Şiir & Dinleti</span>
              <span class="text-slate-300">${escapeHtml(p.author || 'Hayal Sahnesi')}</span>
            </div>
            <h4 class="text-base font-bold text-white">${escapeHtml(p.title)}</h4>
            <blockquote class="text-xs font-serif-stage italic text-slate-200 border-l-2 border-rose-500/40 pl-3 line-clamp-3">
              "${escapeHtml(p.textBody || p.description || 'Kelimeler perdeye dökülüyor...')}"
            </blockquote>
          </div>
          <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <div class="text-[11px] text-slate-400 flex items-center gap-2">
              <span><i class="fa-solid fa-thumbs-up text-emerald-400"></i> ${p.likes || 0}</span>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="openInteractionsById('${p._id}')" class="bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1">
                <i class="fa-solid fa-book-open"></i> Oku & Yorum Yap
              </button>
              ${isSpotify ? `
              <button onclick="openSpotifyModal('${escapeHtml(p.title)}', '${escapeHtml(p.author || 'Hayal Sahnesi')}', '${escapeHtml(p.mediaUrl)}', '${p._id}')" class="bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-emerald-500/30">
                <i class="fa-brands fa-spotify text-sm"></i> Spotify
              </button>` : (p.mediaUrl ? `
              <button onclick="handleMediaPlay('${escapeHtml(p.title)}', '${escapeHtml(p.author || 'Hayal Sahnesi')}', '${escapeHtml(p.mediaUrl)}', 'poem')" class="bg-rose-600/20 hover:bg-rose-600 text-rose-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1">
                <i class="fa-solid fa-headphones"></i> Dinle
              </button>` : '')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Hikayeler
  const stories = items.filter(x => x.type === 'story');
  const storyGrid = document.getElementById('story-grid');
  if (storyGrid) {
    storyGrid.innerHTML = stories.map(s => `
      <div class="card-stage p-5 rounded-2xl hover:border-emerald-500/40 transition flex flex-col justify-between gap-3">
        <div>
          <div class="flex items-center justify-between text-[11px] text-emerald-400 font-semibold mb-1">
            <span>${escapeHtml(s.author || 'Hayal Sahnesi')}</span>
            <span>Hikaye</span>
          </div>
          <h4 class="text-base font-bold text-white mb-1.5">${escapeHtml(s.title)}</h4>
          <p class="text-xs text-slate-300 line-clamp-3">${escapeHtml(s.textBody || s.description || '...')}</p>
        </div>
        <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <span class="text-[11px] text-slate-400"><i class="fa-solid fa-thumbs-up text-emerald-400"></i> ${s.likes || 0}</span>
          <button onclick="openInteractionsById('${s._id}')" class="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1">
            <i class="fa-solid fa-book-open"></i> Oku & Yorum Yap
          </button>
        </div>
      </div>
    `).join('');
  }

  // 3. Fotoromanlar
  const photos = items.filter(x => x.type === 'photoroman');
  const photoGrid = document.getElementById('photoroman-grid');
  if (photoGrid) {
    if (photos.length === 0) {
      photoGrid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400">Henüz fotoroman eseri eklenmemiş.</div>`;
    } else {
      photoGrid.innerHTML = photos.map(ph => {
        const frames = (ph.images && Array.isArray(ph.images) && ph.images.length > 0) ? ph.images : [{ img: ph.thumbnail || '', text: ph.textBody || '', desc: '' }];
        const frameCount = frames.length;
        const coverImg = ph.thumbnail || (frames[0] && frames[0].img) || '';

        return `
          <div class="card-stage p-4 rounded-2xl flex flex-col justify-between hover:border-amber-500/40 transition gap-3">
            <div class="w-full img-box-photo rounded-xl overflow-hidden relative border border-slate-800">
              ${coverImg 
                ? `<img data-src="${escapeHtml(coverImg)}" alt="${escapeHtml(ph.title)}" class="w-full h-full object-cover transition-opacity duration-300 opacity-0">` 
                : `<div class="w-full h-full flex items-center justify-center text-amber-400"><i class="fa-solid fa-camera-retro text-3xl"></i></div>`}
              <span class="absolute top-2.5 right-2.5 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-bold text-amber-300 font-mono">
                ${frameCount} Kare
              </span>
            </div>
            <div>
              <h4 class="font-bold text-white text-base leading-snug">${escapeHtml(ph.title)}</h4>
              <p class="text-xs text-slate-300 mt-0.5">${escapeHtml(ph.author || 'Hayal Sahnesi')}</p>
            </div>
            <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span class="text-[11px] text-slate-400"><i class="fa-solid fa-thumbs-up text-amber-400"></i> ${ph.likes || 0}</span>
              <button onclick="launchPhotoromanById('${ph._id}')" class="bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-amber-500/30">
                <i class="fa-solid fa-book-open"></i> Oku & Dinle
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. Mini Diziler
  const series = items.filter(x => x.type === 'series');
  const seriesGrid = document.getElementById('series-grid');
  if (seriesGrid) {
    if (series.length === 0) {
      seriesGrid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400">Henüz mini dizi eklenmemiş.</div>`;
    } else {
      seriesGrid.innerHTML = series.map(se => `
        <div class="card-stage rounded-2xl overflow-hidden group hover:border-purple-500/50 transition flex flex-col justify-between">
          <div class="img-box relative flex items-center justify-center cursor-pointer" onclick="openVideoPlayer('${escapeHtml(se.title)}', '${escapeHtml(se.author || 'Hayal Sahnesi')}', '${escapeHtml(se.mediaUrl || '')}')">
            <div class="w-12 h-12 rounded-full bg-rose-600/80 flex items-center justify-center text-white z-20 group-hover:scale-110 transition shadow-lg">
              <i class="fa-solid fa-play ml-0.5"></i>
            </div>
          </div>
          <div class="p-4 space-y-1.5 flex-1 flex flex-col justify-between">
            <div>
              <span class="text-[10px] font-bold text-purple-400 uppercase tracking-wide">Mini Dizi</span>
              <h4 class="font-bold text-white text-base leading-tight">${escapeHtml(se.title)}</h4>
              <p class="text-xs text-slate-300 line-clamp-2 mt-1">${escapeHtml(se.textBody || se.description || '')}</p>
            </div>
            <div class="pt-2 border-t border-white/5 flex items-center justify-between">
              <button onclick="openInteractionsById('${se._id}')" class="text-[11px] text-purple-300 hover:text-white flex items-center gap-1">
                <i class="fa-solid fa-comments"></i> Yorum & Beğeni
              </button>
              <span class="text-[11px] text-slate-400"><i class="fa-solid fa-thumbs-up text-purple-400"></i> ${se.likes || 0}</span>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // 5. Müzikler
  const musics = items.filter(x => x.type === 'music');
  const musicGrid = document.getElementById('music-grid');
  if (musicGrid) {
    if (musics.length === 0) {
      musicGrid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400">Henüz müzik eseri eklenmemiş.</div>`;
    } else {
      musicGrid.innerHTML = musics.map(m => {
        const isSpotify = m.mediaUrl && m.mediaUrl.includes('spotify.com');
        const isYouTube = m.mediaUrl && (m.mediaUrl.includes('youtube.com') || m.mediaUrl.includes('youtu.be'));

        return `
          <div class="card-stage p-5 rounded-2xl flex flex-col justify-between hover:border-cyan-500/50 transition border border-cyan-900/40 gap-4">
            <div class="flex items-center space-x-3.5">
              <div class="w-11 h-11 rounded-xl ${isSpotify ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'} flex items-center justify-center text-base font-bold shrink-0">
                <i class="${isSpotify ? 'fa-brands fa-spotify text-lg' : 'fa-solid fa-music'}"></i>
              </div>
              <div class="truncate">
                <h4 class="font-bold text-white text-base truncate">${escapeHtml(m.title)}</h4>
                <p class="text-xs ${isSpotify ? 'text-emerald-400' : 'text-cyan-400'} font-semibold truncate">${escapeHtml(m.author || 'Hayal Sahnesi')}</p>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-slate-400 pt-1">
              <span class="flex items-center gap-1"><i class="fa-solid fa-thumbs-up text-cyan-400"></i> ${m.likes || 0}</span>
              <button onclick="openInteractionsById('${m._id}')" class="text-cyan-300 hover:text-white text-[11px] underline flex items-center gap-1">
                <i class="fa-solid fa-comments"></i> Yorumlar & Beğeni
              </button>
            </div>

            <div class="flex items-center gap-2 pt-2 border-t border-cyan-900/40">
              ${isSpotify ? `
              <button onclick="openSpotifyModal('${escapeHtml(m.title)}', '${escapeHtml(m.author || 'Hayal Sahnesi')}', '${escapeHtml(m.mediaUrl)}', '${m._id}')" class="flex-1 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition border border-emerald-500/30">
                <i class="fa-brands fa-spotify text-base"></i> Spotify'da Dinle
              </button>` : `
              <button onclick="handleMediaPlay('${escapeHtml(m.title)}', '${escapeHtml(m.author || 'Hayal Sahnesi')}', '${escapeHtml(m.mediaUrl || '')}', 'music')" class="flex-1 bg-cyan-600/25 hover:bg-cyan-600 text-cyan-100 hover:text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition">
                <i class="fa-solid fa-headphones"></i> Dinle
              </button>`}
              
              ${isYouTube ? `
              <button onclick="openVideoPlayer('${escapeHtml(m.title)}', '${escapeHtml(m.author || 'Hayal Sahnesi')}', '${escapeHtml(m.mediaUrl || '')}')" class="flex-1 stage-gradient text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition">
                <i class="fa-solid fa-film"></i> İzle
              </button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function createShowcaseCard(item) {
  let icon = 'fa-sparkles';
  let color = 'rose';
  let badge = 'Eser';

  if (item.type === 'photoroman') { icon = 'fa-camera-retro'; color = 'amber'; badge = 'Fotoroman'; }
  else if (item.type === 'series') { icon = 'fa-film'; color = 'purple'; badge = 'Mini Dizi'; }
  else if (item.type === 'poem') { icon = 'fa-feather'; color = 'rose'; badge = 'Şiir'; }
  else if (item.type === 'story') { icon = 'fa-book-open'; color = 'emerald'; badge = 'Hikaye'; }
  else if (item.type === 'music') { 
    const isSp = item.mediaUrl && item.mediaUrl.includes('spotify.com');
    icon = isSp ? 'fa-brands fa-spotify' : 'fa-music'; 
    color = isSp ? 'emerald' : 'cyan'; 
    badge = isSp ? 'Spotify' : 'Müzik'; 
  }

  return `
    <div class="card-stage p-4 rounded-2xl hover:border-${color}-500/40 transition flex flex-col justify-between gap-3">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold text-${color}-400 uppercase tracking-wide flex items-center gap-1">
          <i class="${icon}"></i> ${badge}
        </span>
        <span class="text-[11px] text-slate-300">${escapeHtml(item.author || 'Hayal Sahnesi')}</span>
      </div>
      <div>
        <h4 class="font-bold text-white text-base leading-snug">${escapeHtml(item.title)}</h4>
        <p class="text-xs text-slate-300 line-clamp-2 mt-1">${escapeHtml(item.textBody || item.description || 'Sahne eseri...')}</p>
      </div>
      <button onclick="switchCategory('${item.type}')" class="w-full bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-${color}-500 py-1.5 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5">
        Bölüme Git →
      </button>
    </div>
  `;
}

function getYouTubeId(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}

// --- MEDYA OYNATICI VE KATEGORİ ODAKLI ÇALMA LİSTESİ ---
let musicPlaylist = [];
let currentShuffleIndex = 0;
let currentActiveCategory = 'music';

function handleMediaPlay(title, author, mediaUrl, type = 'music') {
  currentActiveCategory = type;

  const playerTitle = document.getElementById('player-title');
  const playerArtist = document.getElementById('player-subtitle');
  if (playerTitle) playerTitle.innerText = title;
  if (playerArtist) playerArtist.innerText = (author || 'Hayal Sahnesi') + ' • Sahne Çalıyor';

  if (globalAudio) {
    globalAudio.pause();
    globalAudio.src = '';
  }
  if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
    try { ytPlayer.stopVideo(); } catch(e) {}
  }
  const oldActiveYt = document.getElementById('active-bg-yt');
  if (oldActiveYt) oldActiveYt.remove();

  if (!mediaUrl) return;

  if (mediaUrl.includes('spotify.com')) {
    openSpotifyModal(title, author, mediaUrl);
    return;
  }

  const videoId = getYouTubeId(mediaUrl);

  if (videoId) {
    activeSourceType = 'youtube';
    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
      ytPlayer.loadVideoById(videoId);
      ytPlayer.playVideo();
    } else {
      let hiddenContainer = document.getElementById('hidden-yt-container');
      if (!hiddenContainer) {
        hiddenContainer = document.createElement('div');
        hiddenContainer.id = 'hidden-yt-container';
        hiddenContainer.className = 'hidden pointer-events-none opacity-0 fixed -bottom-96 -right-96';
        document.body.appendChild(hiddenContainer);
      }
      hiddenContainer.innerHTML = `<iframe id="active-bg-yt" width="200" height="200" src="https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1" frameborder="0" allow="autoplay"></iframe>`;
    }

    isPlaying = true;
    updateShuffleBtnIcon(true);
  } else {
    activeSourceType = 'audio';
    if (globalAudio) {
      globalAudio.src = mediaUrl;
      globalAudio.playbackRate = availableSpeeds[currentSpeedIndex];
      globalAudio.play().catch(e => console.log('Ses hatası:', e));
      isPlaying = true;
      updateShuffleBtnIcon(true);
    }
  }
}
window.handleMediaPlay = handleMediaPlay;

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function playCategoryTracks(type = 'music') {
  currentActiveCategory = type;
  let playable = allContents.filter(item => item.type === type && item.mediaUrl && !item.mediaUrl.includes('spotify.com'));
  
  if (!playable || playable.length === 0) {
    playable = allContents.filter(item => (item.type === 'music' || item.type === 'poem') && item.mediaUrl && !item.mediaUrl.includes('spotify.com'));
  }

  if (!playable || playable.length === 0) {
    alert('Bu kategoride çalınabilir bir ses eseri bulunamadı.');
    return;
  }

  musicPlaylist = shuffleArray([...playable]);
  currentShuffleIndex = 0;
  playCurrentShuffleTrack();
}

function playRandomMusicList() {
  playCategoryTracks('music');
}
window.playRandomMusicList = playRandomMusicList;

function playPoemPlaylist() {
  playCategoryTracks('poem');
}
window.playPoemPlaylist = playPoemPlaylist;

function playCurrentShuffleTrack() {
  if (!musicPlaylist || musicPlaylist.length === 0) return;
  const track = musicPlaylist[currentShuffleIndex];
  handleMediaPlay(track.title, track.author, track.mediaUrl, track.type || currentActiveCategory);
  const playerArtist = document.getElementById('player-subtitle');
  if (playerArtist) {
    playerArtist.innerText = (track.author || 'Sanatçı') + ' • (' + (currentShuffleIndex + 1) + '/' + musicPlaylist.length + ')';
  }
}

function playNextShuffleTrack() {
  if (!musicPlaylist || musicPlaylist.length === 0) {
    playCategoryTracks(currentActiveCategory);
    return;
  }
  currentShuffleIndex = (currentShuffleIndex + 1) % musicPlaylist.length;
  playCurrentShuffleTrack();
}
window.playNextShuffleTrack = playNextShuffleTrack;

function playPrevShuffleTrack() {
  if (!musicPlaylist || musicPlaylist.length === 0) return;
  currentShuffleIndex = (currentShuffleIndex - 1 + musicPlaylist.length) % musicPlaylist.length;
  playCurrentShuffleTrack();
}
window.playPrevShuffleTrack = playPrevShuffleTrack;

if (globalAudio) {
  globalAudio.onended = function() {
    playNextShuffleTrack();
  };
}

function updateShuffleBtnIcon(playing) {
  const playPauseBtn = document.getElementById('play-pause-btn');
  if (!playPauseBtn) return;
  const icon = playPauseBtn.querySelector('i');
  if (!icon) return;
  icon.className = playing ? 'fa-solid fa-pause text-xs' : 'fa-solid fa-play text-xs';
}

function togglePlayState() {
  if (isPlaying) {
    if (activeSourceType === 'audio' && globalAudio) globalAudio.pause();
    if (activeSourceType === 'youtube' && ytPlayer && typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
    const activeYt = document.getElementById('active-bg-yt');
    if (activeYt) activeYt.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
    isPlaying = false;
    updateShuffleBtnIcon(false);
  } else {
    if (activeSourceType === 'audio' && globalAudio && globalAudio.src) globalAudio.play();
    if (activeSourceType === 'youtube' && ytPlayer && typeof ytPlayer.playVideo === 'function') ytPlayer.playVideo();
    const activeYt = document.getElementById('active-bg-yt');
    if (activeYt) activeYt.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
    isPlaying = true;
    updateShuffleBtnIcon(true);
  }
}
window.togglePlayState = togglePlayState;

function openVideoPlayer(title, author, mediaUrl) {
  document.getElementById('video-title').innerText = title;
  document.getElementById('video-ep').innerText = author || 'Özel Gösterim';

  const container = document.getElementById('video-container');
  const videoId = getYouTubeId(mediaUrl);
  if (videoId) {
    container.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    container.innerHTML = '<div class="p-6 text-center text-slate-300 text-xs">Bu esere ait video bulunmuyor.</div>';
  }
  openModal('modal-video');
}
window.openVideoPlayer = openVideoPlayer;

// --- FOTOROMAN MOTORU & SİLÜETLİ OKUYUCU ---
let currentPhotoPages = [];
let currentPhotoIndex = 0;

function launchPhotoromanById(id) {
  const item = allContents.find(c => String(c._id) === String(id));
  if (!item) return;
  activePhotoromanItem = item;

  const frames = (item.images && Array.isArray(item.images) && item.images.length > 0) 
    ? item.images 
    : [{ img: item.thumbnail || '', text: item.textBody || item.description || 'Sahne başladı...', desc: '' }];

  const rLikes = document.getElementById('reader-like-count');
  const rDislikes = document.getElementById('reader-dislike-count');
  if (rLikes) rLikes.innerText = item.likes || 0;
  if (rDislikes) rDislikes.innerText = item.dislikes || 0;

  updateFavoriteButtonStyles();
  openReader(item.title, item.author, `${frames.length} Kare`, frames, item.musicUrl || item.mediaUrl || '');
}
window.launchPhotoromanById = launchPhotoromanById;

function openReader(title, desc, frameCount, imagesList, musicUrl) {
  document.getElementById('reader-title').innerText = title || 'Fotoroman';
  document.getElementById('reader-info').innerText = frameCount || 'Özel Sahne';

  currentPhotoPages = imagesList;
  currentPhotoIndex = 0;
  renderPhotoPage();

  if (readerBgAudio && musicUrl) {
    readerBgAudio.src = musicUrl;
    readerBgAudio.playbackRate = availableSpeeds[currentSpeedIndex];
    readerBgAudio.currentTime = 0;
    readerBgAudio.volume = 0.5;
    readerBgAudio.muted = false;
    readerBgAudio.play().catch(e => console.log('Müzik başlatılamadı:', e));
  }

  openModal('modal-reader');
}

function renderPhotoPage() {
  if (!currentPhotoPages || currentPhotoPages.length === 0) return;

  const mainImg = document.getElementById('reader-img');
  const prevImg = document.getElementById('reader-img-prev');
  const nextImg = document.getElementById('reader-img-next');
  const dialogEl = document.getElementById('reader-dialog');
  const sceneDescEl = document.getElementById('reader-scene-desc');
  const counterEl = document.getElementById('reader-page-counter');

  const currentPage = currentPhotoPages[currentPhotoIndex];
  const mainSrc = typeof currentPage === 'string' ? currentPage : (currentPage.img || '');
  const dialogText = typeof currentPage === 'string' ? `Kare ${currentPhotoIndex + 1}` : (currentPage.text || '');
  const sceneDesc = (typeof currentPage === 'object' && currentPage.desc) ? currentPage.desc : '';

  // Ana Görsel
  if (mainImg) {
    mainImg.style.opacity = '0.3';
    mainImg.src = mainSrc;
    setTimeout(() => { mainImg.style.opacity = '1'; }, 100);
  }

  // Sol Silüet (Önceki Sayfa)
  if (prevImg) {
    if (currentPhotoIndex > 0) {
      const prevPage = currentPhotoPages[currentPhotoIndex - 1];
      prevImg.src = typeof prevPage === 'string' ? prevPage : (prevPage.img || '');
      prevImg.classList.remove('hidden');
    } else {
      prevImg.classList.add('hidden');
    }
  }

  // Sağ Silüet (Sonraki Sayfa)
  if (nextImg) {
    if (currentPhotoIndex < currentPhotoPages.length - 1) {
      const nextPage = currentPhotoPages[currentPhotoIndex + 1];
      nextImg.src = typeof nextPage === 'string' ? nextPage : (nextPage.img || '');
      nextImg.classList.remove('hidden');
    } else {
      nextImg.classList.add('hidden');
    }
  }

  if (dialogEl) dialogEl.innerText = dialogText || `Kare ${currentPhotoIndex + 1}`;
  
  if (sceneDescEl) {
    if (sceneDesc.trim() !== '') {
      sceneDescEl.innerText = 'Yönetmen Notu / Açıklama: ' + sceneDesc;
      sceneDescEl.classList.remove('hidden');
    } else {
      sceneDescEl.classList.add('hidden');
    }
  }

  if (counterEl) counterEl.innerText = `Kare ${currentPhotoIndex + 1} / ${currentPhotoPages.length}`;
}

function nextPhotoPage() {
  if (currentPhotoIndex < currentPhotoPages.length - 1) {
    currentPhotoIndex++;
    renderPhotoPage();
  }
}
window.nextPhotoPage = nextPhotoPage;

function prevPhotoPage() {
  if (currentPhotoIndex > 0) {
    currentPhotoIndex--;
    renderPhotoPage();
  }
}
window.prevPhotoPage = prevPhotoPage;

function changeReaderVolume(val) {
  if (!readerBgAudio) return;
  readerBgAudio.volume = parseFloat(val);
  readerBgAudio.muted = false;
  updateReaderAudioIcon(parseFloat(val));
}
window.changeReaderVolume = changeReaderVolume;

function toggleReaderAudioMute() {
  if (!readerBgAudio) return;
  readerBgAudio.muted = !readerBgAudio.muted;
  updateReaderAudioIcon(readerBgAudio.muted ? 0 : readerBgAudio.volume);
}
window.toggleReaderAudioMute = toggleReaderAudioMute;

function updateReaderAudioIcon(vol) {
  const icon = document.getElementById('reader-volume-icon');
  if (!icon) return;
  if ((readerBgAudio && readerBgAudio.muted) || vol === 0) {
    icon.className = 'fa-solid fa-volume-xmark text-rose-400';
  } else if (vol < 0.4) {
    icon.className = 'fa-solid fa-volume-low text-purple-300';
  } else {
    icon.className = 'fa-solid fa-volume-high text-purple-400';
  }
}

window.addEventListener('keydown', (e) => {
  const readerModal = document.getElementById('modal-reader');
  if (readerModal && !readerModal.classList.contains('hidden')) {
    if (e.key === 'ArrowRight') nextPhotoPage();
    if (e.key === 'ArrowLeft') prevPhotoPage();
    if (e.key === 'Escape') closeModal('modal-reader');
  }
});

// --- ESER GÖNDER FORMU ---
async function handleContact(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('btn-contact-submit');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Gönderiliyor...';

  const payload = {
    name: document.getElementById('contact-name').value.trim(),
    title: document.getElementById('contact-title').value.trim(),
    type: document.getElementById('contact-type').value,
    mediaUrl: document.getElementById('contact-media-url').value.trim(),
    textBody: document.getElementById('contact-text-body').value.trim(),
    email: document.getElementById('contact-email').value.trim(),
    phone: document.getElementById('contact-phone').value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('✓ Eseriniz başarıyla ulaştı! İncelendikten sonra sahnede yer alacaktır.');
      closeModal('modal-contact');
      e.target.reset();
    } else {
      alert(data.message || 'Gönderilemedi, lütfen tekrar deneyin.');
    }
  } catch (err) {
    alert('Sunucuya bağlanırken bir hata oluştu.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Eseri Sahneye Gönder';
  }
}
window.handleContact = handleContact;

// --- MODAL YÖNETİMİ ---
function openModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden'); 
}
window.openModal = openModal;

function closeModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden'); 
  if (id === 'modal-video') {
    const vidCont = document.getElementById('video-container');
    if (vidCont) vidCont.innerHTML = '';
  }
  if (id === 'modal-reader') {
    if (readerBgAudio) {
      readerBgAudio.pause();
      readerBgAudio.src = '';
    }
  }
  if (id === 'modal-spotify') {
    const spCont = document.getElementById('spotify-iframe-container');
    if (spCont) spCont.innerHTML = '';
  }
}
window.closeModal = closeModal;

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// --- BAŞLANGIÇ ÇALIŞTIRICISI ---
window.addEventListener('DOMContentLoaded', () => {
  updateFavoriteCounter();
  loadLiveContents();

  setTimeout(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  }, 2000);
});