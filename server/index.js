const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Bağlantısı
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Hayal Sahnesi veritabanına bağlandı.'))
  .catch((err) => console.error('❌ MongoDB bağlantı hatası:', err));
} else {
console.warn('⚠️ MONGODB_URI ortam değişkeni tanımlanmadı (.env dosyasını kontrol edin)');
}

// ---------------- MODEL SCHEMAS ---------------- //

// Eser / İçerik Modeli
const ContentSchema = new mongoose.Schema({
title: { type: String, required: true },
type: { 
  type: String, 
  enum: ['poem', 'series', 'photoroman', 'story', 'music'], 
  required: true 
},
mediaUrl: { type: String, default: '' }, // Ses, Video linki veya kapak
textBody: { type: String, default: '' }, // Şiir sözleri veya hikaye
status: { 
  type: String, 
  enum: ['published', 'draft', 'pending'], 
  default: 'published' 
},
author: { type: String, default: 'Yusuf Ziya' },
createdAt: { type: Date, default: Date.now }
});

const Content = mongoose.model('Content', ContentSchema);

// ---------------- API ENDPOINTS ---------------- //

// Test & Durum Kontrolü
app.get('/api/health', (req, res) => {
res.json({ status: 'active', message: 'Hayal Sahnesi API çalışıyor!' });
});

// 1. Tüm Yayındaki İçerikleri Getir (Vitrin / index.html için)
app.get('/api/contents', async (req, res) => {
try {
  const contents = await Content.find({ status: 'published' }).sort({ createdAt: -1 });
  res.json(contents);
} catch (err) {
  res.status(500).json({ error: 'İçerikler getirilemedi', details: err.message });
}
});

// 2. Tüm İçerikleri Getir (Admin Paneli için - Taslaklar ve Onay Bekleyenler dahil)
app.get('/api/admin/contents', async (req, res) => {
try {
  const contents = await Content.find().sort({ createdAt: -1 });
  res.json(contents);
} catch (err) {
  res.status(500).json({ error: 'İçerikler alınamadı', details: err.message });
}
});

// 3. Yeni Eser Ekle (Admin & Personel Yükleme Formu)
app.post('/api/contents', async (req, res) => {
try {
  const { title, type, mediaUrl, textBody, status, author } = req.body;
  
  const newContent = new Content({
    title,
    type,
    mediaUrl,
    textBody,
    status: status || 'published',
    author: author || 'Yönetici'
  });

  const saved = await newContent.save();
  res.status(201).json({ success: true, data: saved });
} catch (err) {
  res.status(400).json({ error: 'Eser kaydedilemedi', details: err.message });
}
});

// 4. Eser Durumu Güncelle (Onaylama / Taslağa Çekme)
app.patch('/api/contents/:id/status', async (req, res) => {
try {
  const { status } = req.body;
  const updated = await Content.findByIdAndUpdate(
    req.params.id, 
    { status }, 
    { new: true }
  );
  res.json({ success: true, data: updated });
} catch (err) {
  res.status(400).json({ error: 'Durum güncellenemedi', details: err.message });
}
});

// Sunucuyu Dinle
app.listen(PORT, () => {
console.log(`🚀 Hayal Sahnesi API Port ${PORT} üzerinde hazır!`);
});