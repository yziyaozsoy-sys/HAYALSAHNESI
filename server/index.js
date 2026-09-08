const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- MONGODB BAĞLANTISI ---
// Render ortamındaki MONGODB_URI kullanılır, yoksa mevcut bağlantı dizgisi devreye girer
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Cluster0:Cluster0@cluster0.hayalsahnesi.mongodb.net/hayalsahnesi?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('>>> [HAYAL SAHNESİ] MongoDB Atlas bağlantısı başarıyla kuruldu.'))
.catch(err => console.error('MongoDB Atlas Bağlantı Hatası:', err));

// --- KRİTİK ŞEMA GÜNCELLEMESİ (METİNLER VE ŞİİRLER İÇİN) ---
const contentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, required: true }, // music, poem, series, photoroman, story
  author: { type: String, default: 'Yusuf Ziya' },
  status: { type: String, default: 'draft' }, // published, draft
  mediaUrl: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  textBody: { type: String, default: '' }, // Şiir mısraları, hikaye içeriği
  description: { type: String, default: '' }, // Açıklama veya özet
  plays: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { 
  strict: false // Esnek şema: Hiçbir metin alanı Mongoose tarafından filtrelenmez!
});

const Content = mongoose.model('Content', contentSchema);

// --- API ENDPOINT'LERİ ---

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

// 3. Yeni Eser Ekle (Metinleri hem textBody hem description olarak kaydeder)
app.post('/api/contents', async (req, res) => {
  try {
    const { title, type, author, status, mediaUrl, thumbnail, textBody, description } = req.body;
    const contentText = textBody || description || '';

    const newContent = new Content({
      title,
      type,
      author: author || 'Yusuf Ziya',
      status: status || 'draft',
      mediaUrl: mediaUrl || '',
      thumbnail: thumbnail || '',
      textBody: contentText,
      description: contentText
    });

    const saved = await newContent.save();
    console.log('Yeni Eser MongoDB\'ye Kaydedildi:', saved.title);
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    console.error('Kayıt Hatası:', err);
    res.status(400).json({ error: 'Eser kaydedilemedi', details: err.message });
  }
});

// 4. Eser Güncelleme (Düzenleme yapıldığında metni günceller)
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

// Kök Dizin Kontrolü
app.get('/', (req, res) => {
  res.send('Hayal Sahnesi API Sunucusu Aktif & Çalışıyor.');
});

// Port Dinleme
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Hayal Sahnesi API sunucusu ${PORT} portunda aktif.`);
});