const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// -----------------------------------------------
// 1. DASHBOARD REDIRECT PUBLIC (Scan QR / NFC)
// -----------------------------------------------
app.get('/r/:idCode', async (req, res) => {
  const { idCode } = req.params;

  try {
    const device = await prisma.device.findUnique({ where: { idCode } });

    if (!device) {
      return res.status(404).send('<h1 style="text-align:center;margin-top:50px;">Alat Tidak Terdaftar!</h1>');
    }

    if (!device.targetUrl) {
      return res.send(`<h1 style="text-align:center;margin-top:50px;">Alat ${idCode} Belum Diaktivasi</h1>`);
    }

    // Incremental Counter Scan
    await prisma.device.update({
      where: { idCode },
      data: { scanCount: { increment: 1 } }
    });

    return res.redirect(302, device.targetUrl);
  } catch (error) {
    console.error('Error Redirect:', error);
    return res.status(500).send('Server Error');
  }
});

// -----------------------------------------------
// 2. MASTER API (Khusus Admin)
// -----------------------------------------------

// Ambil Semua Daftar Alat
app.get('/api/admin/devices', async (req, res) => {
  const apiKey = req.headers['x-admin-key'];
  if (apiKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ success: false, message: 'Password Admin Salah!' });
  }

  try {
    const devices = await prisma.device.findMany({ orderBy: { idCode: 'asc' } });
    return res.json({ success: true, data: devices });
  } catch (error) {
    console.error('Error Fetch Devices:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Upsert (Tambah / Update Link Alat)
app.post('/api/admin/update', async (req, res) => {
  const apiKey = req.headers['x-admin-key'];
  const { idCode, targetUrl, clientName } = req.body;

  if (apiKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ success: false, message: 'Password Admin Salah!' });
  }

  if (!idCode || !targetUrl) {
    return res.status(400).json({ success: false, message: 'Kode Alat dan Link wajib diisi!' });
  }

  const cleanId = idCode.trim();
  const cleanUrl = targetUrl.trim();
  const cleanClient = clientName ? clientName.trim() : null;

  try {
    // Attempt 1: Coba simpan beserta clientName ke userId
    const device = await prisma.device.upsert({
      where: { idCode: cleanId },
      update: {
        targetUrl: cleanUrl,
        userId: cleanClient,
        status: 'CLAIMED'
      },
      create: {
        idCode: cleanId,
        targetUrl: cleanUrl,
        userId: cleanClient,
        status: 'CLAIMED'
      }
    });

    return res.json({ success: true, message: `Berhasil simpan data ${cleanId}`, data: device });

  } catch (error) {
    console.error('Attempt 1 Failed (foreign key issue), running fallback...', error.message);

    // Attempt 2 (Fallback): Jika userId error karena constraint DB, simpan link-nya saja
    try {
      const fallbackDevice = await prisma.device.upsert({
        where: { idCode: cleanId },
        update: {
          targetUrl: cleanUrl,
          status: 'CLAIMED'
        },
        create: {
          idCode: cleanId,
          targetUrl: cleanUrl,
          status: 'CLAIMED'
        }
      });

      return res.json({ 
        success: true, 
        message: `Berhasil simpan link ${cleanId}!`, 
        data: fallbackDevice 
      });

    } catch (fallbackErr) {
      console.error('Error Admin Update:', fallbackErr);
      return res.status(500).json({ success: false, message: `Gagal: ${fallbackErr.message}` });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});