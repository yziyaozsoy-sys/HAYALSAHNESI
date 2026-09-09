// server/index.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());

// Görsel ve loop fon müziği (Base64) MongoDB'ye sığabilsin diye limit 50mb yapıldı
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MongoDB Bağlantısı (Render Environment'tan çeker)
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Hayal Sahnesi veritabanına bağlandı.'))
    .catch((err) => console.error('❌ MongoDB bağlantı hatası:', err));
} else {
  console.warn('⚠️ MONGODB_URI ortam değişkeni tanımlanmadı (.env veya Render kontrol edin)');
}

// --- İÇERİK ŞEMASI (FOTOROMAN KARELERİ VE LOOP MÜZİK DAHİL) ---
const contentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, required: true }, // music, poem, series, photoroman, story
  author: { type: String, default: 'Anonim' },
  email: { type: String, default: '' },       // İletişim e-posta
  phone: { type: String, default: '' },       // İletişim telefon
  status: { type: String, default: 'draft' }, // published, draft
  mediaUrl: { type: String, default: '' },
  musicUrl: { type: String, default: '' },    // Fotoroman Arka Plan Loop Fon Müziği
  thumbnail: { type: String, default: '' },
  images: [{                                  // Fotoroman Kareleri / Sayfaları
    img: { type: String, default: '' },       // Görsel (URL veya Base64)
    text: { type: String, default: '' }       // Karedeki Diyalog / Replik
  }],
  textBody: { type: String, default: '' },    // Şiir mısraları, hikaye içeriği
  description: { type: String, default: '' }, // Açıklama veya özet
  plays: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  // Hukuki Sorumluluk ve Telif Onayı
  legalConsent: {
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    ipAddress: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now }
}, { 
  strict: false // Esnek şema
});

const Content = mongoose.model('Content', contentSchema);

// --- PERSONEL / KULLANICI ŞEMASI ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  password: { type: String, required: true },
  role: { type: String, default: 'editor' }, // admin, editor
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ==========================================
// İÇERİK (CONTENT) API ENDPOINT'LERİ
// ==========================================

// 1. Vitrin: Sadece yayındaki (published) eserleri getir
app.get('/api/contents', async (req, res) => {
  try {
    const contents = await Content.find({ status: 'published' }).sort({ createdAt: -1 });
    res.json(contents);
  } catch (err) {
    res.status(500).json({ error: 'İçerikler alınamadı', details: err.message });
  }
});

// 2. Admin & Kürasyon Masası: Taslaklar dahil tüm eserleri getir
app.get('/api/admin/contents', async (req, res) => {
  try {
    const contents = await Content.find().sort({ createdAt: -1 });
    res.json(contents);
  } catch (err) {
    res.status(500).json({ error: 'Admin içerikleri alınamadı', details: err.message });
  }
});

// 3. Eser Ekleme (Fotoroman Kareleri ve Loop Fon Müziği MongoDB'ye Kaydedilir)
app.post('/api/contents', async (req, res) => {
  try {
    const { 
      title, 
      type, 
      author, 
      email, 
      phone, 
      status, 
      mediaUrl, 
      musicUrl,
      thumbnail, 
      images,
      textBody, 
      description,
      legalAccepted 
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
    console.log('✅ Yeni Eser Kaydedildi:', saved.title, '| Tür:', saved.type);
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    console.error('Kayıt Hatası:', err);
    res.status(400).json({ error: 'Eser kaydedilemedi', details: err.message });
  }
});

// 4. Eser Güncelleme (Düzenleme yapıldığında)
app.patch('/api/contents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Content.findByIdAndUpdate(id, req.body, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ error: 'Güncelleme başarısız', details: err.message });
  }
});

// 5. Durum Güncelleme (Yayında / Taslak)
app.patch('/api/contents/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await Content.findByIdAndUpdate(id, { status }, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ error: 'Durum güncellenemedi', details: err.message });
  }
});

// 6. Eser Silme
app.delete('/api/contents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Content.findByIdAndDelete(id);
    res.json({ success: true, message: 'Eser başarıyla silindi' });
  } catch (err) {
    res.status(400).json({ error: 'Silme işlemi başarısız', details: err.message });
  }
});

// ==========================================
// PERSONEL / KULLANICI (USER) API ENDPOINT'LERİ
// ==========================================

// 7. Tüm Personelleri Listele
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Personeller getirilemedi: ' + err.message });
  }
});

// 8. Yeni Personel Ekle
app.post('/api/users', async (req, res) => {
  try {
    const { username, name, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre zorunludur.' });
    }

    const existingUser = await User.findOne({ username: username.trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Bu kullanıcı adı zaten kullanılıyor.' });
    }

    const newUser = new User({
      username: username.trim(),
      name: name ? name.trim() : '',
      password: password.trim(),
      role: role || 'editor'
    });

    await newUser.save();
    res.status(201).json({ success: true, message: 'Personel başarıyla eklendi.', user: newUser });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Personel eklenemedi: ' + err.message });
  }
});

// 9. Personel Bilgilerini ve Şifresini Düzenle / Güncelle (PUT)
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, name, role, password } = req.body;

    const updateData = {};
    if (username) updateData.username = username.trim();
    if (name !== undefined) updateData.name = name.trim();
    if (role) updateData.role = role;

    // Şifre boş bırakılmamışsa yeni şifreyi güncelle, boş bırakılmışsa eski şifre kalsın
    if (password && password.trim() !== '') {
      updateData.password = password.trim();
    }

    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true }).select('-password');
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
    }

    res.json({ success: true, message: 'Personel bilgileri ve şifre başarıyla güncellendi.', user: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Güncelleme hatası: ' + err.message });
  }
});

// 10. Personel Sil
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.json({ success: true, message: 'Personel başarıyla silindi.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Personel silinemedi: ' + err.message });
  }
});

// Kök Dizin Kontrolü
app.get('/', (req, res) => {
  res.send('Hayal Sahnesi API Sunucusu Aktif & Çalışıyor.');
});

// Port Dinleme
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Hayal Sahnesi API sunucusu ${PORT} portunda aktif.`);
});
