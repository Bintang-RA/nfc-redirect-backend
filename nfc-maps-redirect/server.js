const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient();
const app = express();

// Middleware Parsing & Static Files
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ===============================================
// 1. DASHBOARD UTAMA (Diakses Pemilik Kafe)
// ===============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===============================================
// 2. ENDPOINT REDIRECT (Diakses saat Scan QR / Tap NFC)
// ===============================================
app.get('/r/:idCode', async (req, res) => {
  const { idCode } = req.params;

  try {
    const device = await prisma.device.findUnique({ where: { idCode } });

    // Jika ID alat tidak ada di database
    if (!device) {
      return res.status(404).send(`
        <div style="font-family:sans-serif; text-align:center; padding:50px;">
          <h1 style="color:#e53e3e;">Alat Tidak Terdaftar!</h1>
          <p>Kode alat ID "${idCode}" belum dimasukkan ke database sistem.</p>
        </div>
      `);
    }

    // Jika alat belum diaktivasi atau link Google Maps belum diisi
    if (device.status === 'UNCLAIMED' || !device.targetUrl) {
      return res.send(`
        <div style="font-family:sans-serif; text-align:center; padding:50px;">
          <h1>Alat ${idCode} Belum Diaktivasi</h1>
          <p>Silakan masukkan link Google Maps toko kamu melalui halaman Dashboard.</p>
        </div>
      `);
    }

    // Tambah hit counter (+1)
    await prisma.device.update({
      where: { idCode },
      data: { scanCount: { increment: 1 } }
    });

    // Redirect HTTP 302 ke Google Maps
    return res.redirect(302, device.targetUrl);

  } catch (error) {
    console.error('Error Redirect:', error);
    return res.status(500).send('Terjadi kesalahan pada server.');
  }
});

// ===============================================
// 3. API UPDATE LINK (Digunakan oleh Form Dashboard)
// ===============================================
app.post('/api/device/update', async (req, res) => {
  const { idCode, targetUrl, userId } = req.body;

  if (!idCode || !targetUrl) {
    return res.status(400).json({ success: false, message: 'Kode Alat dan Link Google Maps wajib diisi!' });
  }

  try {
    const updatedDevice = await prisma.device.update({
      where: { idCode: idCode.trim() },
      data: {
        targetUrl: targetUrl.trim(),
        userId: userId || null,
        status: 'CLAIMED'
      }
    });

    return res.json({
      success: true,
      message: `Berhasil mengupdate link untuk alat ${idCode}`,
      data: updatedDevice
    });
  } catch (error) {
    console.error('Error Update:', error);
    return res.status(400).json({ 
      success: false, 
      message: 'Gagal mengupdate data. Pastikan Kode Alat sudah terdaftar di Supabase!' 
    });
  }
});

// Port dinamis untuk deployment (Render/Railway) atau local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});