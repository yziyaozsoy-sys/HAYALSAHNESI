// server/index.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
require('dotenv').config();

const app = express();

// 1. Yanıtları Gzip ile sıkıştır (Ağ trafiğini %70 azaltır, hızı artırır)
app.use(compression());

app.use(cors());

// Yüksek boyutlu veri transferi için limitler
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Uploads klasörünü oluştur ve garantiye al
const publicPath = path.resolve(__dirname, '../public');
const uploadDir = path.join(publicPath, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Bellek Depolama (RAM üzerinde tutup sharp ile işleyeceğiz)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 } // Maks 15MB yükleme limiti
});

// ==========================================
// VERİTABANI ŞEMALARI
// ==========================================

// 1. İÇERİK ŞEMASI (REPLİK, AÇIKLAMA, BEĞENİ DESTEKLİ)
const contentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, required: true }, // music, poem, series, photoroman, story
  author: { type: String, default: 'Anonim' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  status: { type: String, default: 'draft' }, // published, draft
  mediaUrl: { type: String, default: '' },
  musicUrl: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  images: [{
    img: { type: String, default: '' },
    text: { type: String, default: '' },       // Sahne Repliği
    desc: { type: String, default: '' }        // Sahne Açıklaması / Yönetmen Notu
  }],
  textBody: { type: String, default: '' },
  description: { type: String, default: '' },
  plays: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },         // Beğeni Sayacı
  dislikes: { type: Number, default: 0 },      // Beğenmeme Sayacı
  legalConsent: {
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    ipAddress: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now }
}, { 
  strict: false 
});

const Content = mongoose.model('Content', contentSchema);

// 2. PERSONEL / KULLANICI ŞEMASI
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, default: '' },
  password: { type: String, required: true },
  role: { type: String, default: 'İçerik Editörü' },
  access: { type: String, default: 'editor' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// 3. REKLAM (ADS) ŞEMASI
const adSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slot: { 
    type: String, 
    required: true, 
    enum: ['skyscraper_left', 'skyscraper_right', 'leaderboard_top', 'in_feed'] 
  },
  type: { 
    type: String, 
    required: true, 
    enum: ['google', 'html', 'image'] 
  },
  code: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  targetUrl: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const Ad = mongoose.model('Ad', adSchema);

// 4. YORUM ŞEMASI
const commentSchema = new mongoose.Schema({
  contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Content', required: true },
  authorName: { type: String, required: true },
  commentText: { type: String, required: true },
  status: { type: String, default: 'approved' },
  ipAddress: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Comment = mongoose.model('Comment', commentSchema);

// 5. YASAKLI KELİME ŞEMASI
const badWordSchema = new mongoose.Schema({
  word: { type: String, required: true, unique: true, lowercase: true, trim: true }
});

const BadWord = mongoose.model('BadWord', badWordSchema);

// ==========================================
// VERİTABANI BAŞLANGIÇ VERİLERİ (SEED)
// ==========================================
async function seedAdminUser() {
  try {
    const adminExists = await User.findOne({ username: 'yusuf' });
    if (!adminExists) {
      await User.create({
        username: 'yusuf',
        name: 'Yusuf Ziya',
        password: 'hayal2026',
        role: 'Genel Sanat Yönetmeni',
        access: 'admin'
      });
      console.log('👑 Ana Yönetici (yusuf) MongoDB bulutunda hazırlandı.');
    }
  } catch (err) {
    console.error('Admin oluşturma hatası:', err.message);
  }
}

async function seedDefaultBadWords() {
  try {
    const count = await BadWord.countDocuments();
    if (count === 0) {
      const defaults = ['aptal', 'salak', 'dolandırıcı', 'sahtekar', 'terbiyesiz'];
      await BadWord.insertMany(defaults.map(w => ({ word: w })));
      console.log('🛡️ Temel yasaklı kelimeler veritabanına eklendi.');
    }
  } catch (err) {
    console.error('Yasaklı kelime tohumlama hatası:', err.message);
  }
}

// MongoDB Bağlantısı (Render Environment'tan çeker)
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(async () => {
      console.log('✅ MongoDB Hayal Sahnesi veritabanına bağlandı.');
      await seedAdminUser();
      await seedDefaultBadWords();
    })
    .catch((err) => console.error('❌ MongoDB bağlantı hatası:', err));
} else {
  console.warn('⚠️ MONGODB_URI ortam değişkeni tanımlanmadı (.env veya Render kontrol edin)');
}

// ==========================================
// OTOMATİK WEBP DÖNÜŞTÜRÜCÜ & GÖRSEL URL API
// ==========================================
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Lütfen bir görsel seçiniz.' });
    }

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const filename = `sahne-${uniqueSuffix}.webp`;
    const outputPath = path.join(uploadDir, filename);

    await sharp(req.file.buffer)
      .resize({ width: 1440, withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toFile(outputPath);

    const imageUrl = `/uploads/${filename}`;

    return res.status(200).json({
      success: true,
      message: 'Görsel başarıyla WebP formatına dönüştürüldü.',
      url: imageUrl,
      filename: filename
    });
  } catch (err) {
    console.error('Görsel işleme hatası:', err);
    return res.status(500).json({ success: false, message: 'Görsel WebP formatına çevrilemedi: ' + err.message });
  }
});

// ==========================================
// REKLAM (ADS) API ENDPOINT'LERİ
// ==========================================
app.get('/api/ads/active', async (req, res) => {
  try {
    const ads = await Ad.find({ isActive: true });
    res.json({ success: true, ads });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Aktif reklamlar alınamadı: ' + err.message });
  }
});

app.get('/api/admin/ads', async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 });
    res.json({ success: true, ads });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Reklamlar alınamadı: ' + err.message });
  }
});

app.post('/api/admin/ads', async (req, res) => {
  try {
    const { title, slot, type, code, imageUrl, targetUrl, isActive } = req.body;
    if (!title || !slot || !type) {
      return res.status(400).json({ success: false, message: 'Başlık, alan ve reklam türü zorunludur.' });
    }

    const newAd = new Ad({
      title,
      slot,
      type,
      code: code || '',
      imageUrl: imageUrl || '',
      targetUrl: targetUrl || '',
      isActive: isActive !== undefined ? Boolean(isActive) : true
    });

    await newAd.save();
    res.status(201).json({ success: true, message: 'Reklam kaydedildi.', ad: newAd });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Reklam ekleme hatası: ' + err.message });
  }
});

app.patch('/api/admin/ads/:id', async (req, res) => {
  try {
    const updated = await Ad.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: 'Reklam güncellendi.', ad: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Güncelleme hatası: ' + err.message });
  }
});

app.delete('/api/admin/ads/:id', async (req, res) => {
  try {
    await Ad.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Reklam silindi.' });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Silme hatası: ' + err.message });
  }
});

// ==========================================
// AUTH API ENDPOINT'İ
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Kullanıcı adı ve parola zorunludur.' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const user = await User.findOne({ username: cleanUsername });

    if (!user || user.password !== password.trim()) {
      return res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
    }

    res.json({
      success: true,
      message: 'Giriş başarılı.',
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        access: user.access
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Giriş sunucu hatası: ' + err.message });
  }
});

// ==========================================
// İÇERİK (CONTENT) & REAKSİYON API ENDPOINT'LERİ
// ==========================================
app.get('/api/contents', async (req, res) => {
  try {
    const contents = await Content.find({ status: 'published' }).sort({ createdAt: -1 });
    res.json(contents);
  } catch (err) {
    res.status(500).json({ error: 'İçerikler alınamadı', details: err.message });
  }
});

app.get('/api/admin/contents', async (req, res) => {
  try {
    const contents = await Content.find().sort({ createdAt: -1 });
    res.json(contents);
  } catch (err) {
    res.status(500).json({ error: 'Admin içerikleri alınamadı', details: err.message });
  }
});

app.post('/api/contents', async (req, res) => {
  try {
    const { 
      title, type, author, email, phone, status, 
      mediaUrl, musicUrl, thumbnail, images, 
      textBody, description, legalAccepted 
    } = req.body;

    const contentText = textBody || description || '';
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const isConsentGiven = Boolean(legalAccepted);

    const newContent = new Content({
      title,
      type,
      author: author || 'Anonim Yazar',
      email: email || '',
      phone: phone || '',
      status: status || 'draft',
      mediaUrl: mediaUrl || '',
      musicUrl: musicUrl || '',
      thumbnail: thumbnail || '',
      images: Array.isArray(images) ? images : [],
      textBody: contentText,
      description: contentText,
      legalConsent: {
        accepted: isConsentGiven,
        acceptedAt: isConsentGiven ? new Date() : null,
        ipAddress: clientIp
      }
    });

    const saved = await newContent.save();
    console.log('✅ Yeni Eser Kaydedildi:', saved.title);
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ error: 'Eser kaydedilemedi', details: err.message });
  }
});

// Beğeni / Beğenmeme Artırma
app.post('/api/contents/:id/react', async (req, res) => {
  try {
    const { action } = req.body;
    const updateField = action === 'dislike' ? { dislikes: 1 } : { likes: 1 };
    const updated = await Content.findByIdAndUpdate(
      req.params.id,
      { $inc: updateField },
      { new: true }
    );
    res.json({ success: true, likes: updated.likes || 0, dislikes: updated.dislikes || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/contents/:id', async (req, res) => {
  try {
    const updated = await Content.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ error: 'Güncelleme başarısız', details: err.message });
  }
});

app.patch('/api/contents/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await Content.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ error: 'Durum güncellenemedi', details: err.message });
  }
});

app.delete('/api/contents/:id', async (req, res) => {
  try {
    await Content.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Eser başarıyla silindi' });
  } catch (err) {
    res.status(400).json({ error: 'Silme işlemi başarısız', details: err.message });
  }
});

// ==========================================
// YORUMLAR & YASAKLI KELİME FİLTRESİ API
// ==========================================
app.get('/api/contents/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ contentId: req.params.id, status: 'approved' }).sort({ createdAt: -1 });
    res.json({ success: true, comments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/contents/:id/comments', async (req, res) => {
  try {
    const { authorName, commentText } = req.body;
    if (!commentText || !commentText.trim()) {
      return res.status(400).json({ success: false, message: 'Yorum metni boş olamaz.' });
    }

    const cleanText = commentText.toLowerCase();
    const badWords = await BadWord.find();
    
    // Yasaklı kelime taraması
    const hasBadWord = badWords.some(bw => cleanText.includes(bw.word));
    if (hasBadWord) {
      return res.status(400).json({
        success: false, 
        message: 'Yorumunuz topluluk kurallarına aykırı veya sakıncalı ifadeler içerdiği için yayınlanamadı.' 
      });
    }

    const newComment = new Comment({
      contentId: req.params.id,
      authorName: authorName && authorName.trim() ? authorName.trim() : 'Ziyaretçi',
      commentText: commentText.trim(),
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    });

    await newComment.save();
    res.status(201).json({ success: true, message: 'Yorumunuz sahnede yerini aldı!', comment: newComment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/comments', async (req, res) => {
  try {
    const comments = await Comment.find().populate('contentId', 'title').sort({ createdAt: -1 });
    res.json({ success: true, comments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/comments/:id', async (req, res) => {
  try {
    await Comment.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Yorum silindi.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/bad-words', async (req, res) => {
  try {
    const words = await BadWord.find().sort({ word: 1 });
    res.json({ success: true, words });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/bad-words', async (req, res) => {
  try {
    const { word } = req.body;
    if (!word) return res.status(400).json({ success: false, message: 'Kelime gerekli.' });
    const newWord = await BadWord.create({ word: word.toLowerCase().trim() });
    res.status(201).json({ success: true, word: newWord });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Kelime eklenemedi veya zaten mevcut.' });
  }
});

app.delete('/api/admin/bad-words/:id', async (req, res) => {
  try {
    await BadWord.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Yasaklı kelime kaldırıldı.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// KULLANICI / PERSONEL API ENDPOINT'LERİ
// ==========================================
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Personeller getirilemedi: ' + err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, name, password, role, access } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre zorunludur.' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const existingUser = await User.findOne({ username: cleanUsername });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Bu kullanıcı adı zaten kullanılıyor.' });
    }

    const newUser = new User({
      username: cleanUsername,
      name: name ? name.trim() : '',
      password: password.trim(),
      role: role || 'İçerik Editörü',
      access: access || 'editor'
    });

    await newUser.save();
    res.status(201).json({ success: true, message: 'Personel başarıyla eklendi.', user: newUser });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Personel eklenemedi: ' + err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, name, role, access, password } = req.body;

    const updateData = {};
    if (username) {
      const cleanUsername = username.toLowerCase().trim();
      const duplicate = await User.findOne({ username: cleanUsername, _id: { $ne: id } });
      if (duplicate) {
        return res.status(400).json({ success: false, message: 'Bu kullanıcı adı başka biri tarafından kullanılıyor.' });
      }
      updateData.username = cleanUsername;
    }
    if (name !== undefined) updateData.name = name.trim();
    if (role) updateData.role = role;
    if (access) updateData.access = access;
    if (password && password.trim() !== '') {
      updateData.password = password.trim();
    }

    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
    }

    res.json({ success: true, message: 'Personel başarıyla güncellendi.', user: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Güncelleme hatası: ' + err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const target = await User.findById(id);
    if (target && target.username === 'yusuf') {
      return res.status(403).json({ success: false, message: 'Ana yönetici (yusuf) hesabı silinemez.' });
    }

    await User.findByIdAndDelete(id);
    res.json({ success: true, message: 'Personel başarıyla silindi.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Personel silinemedi: ' + err.message });
  }
});

// ==========================================
// SAĞLIK KONTROLÜ & STATİK DOSYALAR
// ==========================================
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Hayal Sahnesi API sunucusu aktif ve çalışıyor.' });
});

app.use('/uploads', express.static(uploadDir, {
  maxAge: '7d',
  etag: true
}));

app.use(express.static(publicPath, {
  maxAge: '1d',
  etag: true
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicPath, 'admin.html'));
});

// ==========================================
// PORT DİNLEME (EN SONDA OLMALIDIR)
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🎭 Hayal Sahnesi sunucusu ${PORT} portunda aktif.`);
});
