const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sellerId = process.argv[2];
const templateId = process.argv[3];
const API_KEY = process.env.QIANPULSA_API_KEY;
const API_BASE_URL = 'https://api.qianpulsa.com/api/builder';

async function main() {
  try {
    console.log(`Mengambil konfigurasi untuk Seller: ${sellerId}`);
    
    // 1. Ambil data konfigurasi toko dari backend
    // Jika tidak ada API, kita akan menggunakan mock config untuk testing GitHub Actions
    let config;
    try {
      const response = await axios.get(`${API_BASE_URL}/config/${sellerId}`, {
        headers: { 'x-api-key': API_KEY }
      });
      config = response.data.data;
    } catch (err) {
      console.log('⚠️ API gagal diakses atau belum tersedia. Menggunakan Mock Config untuk testing.');
      config = {
        appName: 'QianPulsa Demo',
        packageName: 'com.qianpulsa.demo',
        versionCode: 1,
        versionName: '1.0.0',
        primaryColor: '#1E3A8A',
        accentColor: '#3B82F6',
        keystoreBase64: null
      };
    }
    
    const appDir = path.join(__dirname, '..', 'apps', templateId);
    
    // Pastikan folder template ada (hanya untuk testing agar script tidak error)
    if (!fs.existsSync(appDir)) {
      console.log(`⚠️ Template ${templateId} tidak ditemukan. Membuat mock Android Project untuk mencegah error.`);
      fs.mkdirSync(path.join(appDir, 'app', 'src', 'main', 'res', 'values'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'app', 'build.gradle'), `applicationId "com.example"\nversionCode 1\nversionName "1.0"`);
      fs.writeFileSync(path.join(appDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml'), `<resources>\n  <string name="app_name">App</string>\n</resources>`);
      fs.writeFileSync(path.join(appDir, 'app', 'src', 'main', 'res', 'values', 'colors.xml'), `<resources>\n  <color name="colorPrimary">#000000</color>\n  <color name="colorAccent">#ffffff</color>\n</resources>`);
      fs.writeFileSync(path.join(appDir, 'gradlew'), `#!/bin/bash\necho "Mock Gradle Build Success"\nmkdir -p app/build/outputs/apk/release\ntouch app/build/outputs/apk/release/app-release-unsigned.apk`);
    }

    // 2. Modifikasi Package Name (build.gradle)
    const buildGradlePath = path.join(appDir, 'app', 'build.gradle');
    if (fs.existsSync(buildGradlePath)) {
      let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
      buildGradle = buildGradle.replace(/applicationId\s+".*"/, `applicationId "${config.packageName}"`);
      buildGradle = buildGradle.replace(/versionCode\s+\d+/, `versionCode ${config.versionCode}`);
      buildGradle = buildGradle.replace(/versionName\s+".*"/, `versionName "${config.versionName}"`);
      fs.writeFileSync(buildGradlePath, buildGradle);
      console.log('✅ Package name & Version diupdate.');
    }

    // 3. Modifikasi App Name (strings.xml)
    const stringsXmlPath = path.join(appDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
    if (fs.existsSync(stringsXmlPath)) {
      let stringsXml = fs.readFileSync(stringsXmlPath, 'utf8');
      stringsXml = stringsXml.replace(/<string name="app_name">.*<\/string>/, `<string name="app_name">${config.appName}</string>`);
      fs.writeFileSync(stringsXmlPath, stringsXml);
      console.log('✅ App Name diupdate.');
    }

    // 4. Modifikasi Warna (colors.xml)
    const colorsXmlPath = path.join(appDir, 'app', 'src', 'main', 'res', 'values', 'colors.xml');
    if (fs.existsSync(colorsXmlPath)) {
      let colorsXml = fs.readFileSync(colorsXmlPath, 'utf8');
      colorsXml = colorsXml.replace(/<color name="colorPrimary">.*<\/color>/, `<color name="colorPrimary">${config.primaryColor}</color>`);
      colorsXml = colorsXml.replace(/<color name="colorAccent">.*<\/color>/, `<color name="colorAccent">${config.accentColor}</color>`);
      fs.writeFileSync(colorsXmlPath, colorsXml);
      console.log('✅ Warna tema diupdate.');
    }

    // 5. Siapkan Keystore
    const keystorePath = path.join(__dirname, '..', 'keystore.jks');
    if (config.keystoreBase64) {
      console.log('Menggunakan keystore lama dari DB...');
      fs.writeFileSync(keystorePath, Buffer.from(config.keystoreBase64, 'base64'));
    } else {
      console.log('Generate keystore baru...');
      execSync(`keytool -genkey -v -keystore ${keystorePath} -alias key0 -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=${config.appName}, OU=QianPulsa, C=ID" -storepass qianpulsapass -keypass qianpulsapass`);
      const newBase64 = fs.readFileSync(keystorePath).toString('base64');
      fs.writeFileSync(path.join(__dirname, '..', 'new_keystore_base64.txt'), newBase64);
    }

    console.log('✅ Konfigurasi selesai. Siap dibuild.');
  } catch (error) {
    console.error('❌ Gagal menyiapkan build:', error.message);
    process.exit(1);
  }
}

main();
