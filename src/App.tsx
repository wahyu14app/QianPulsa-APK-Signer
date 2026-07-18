import React, { useState } from 'react';
import { Copy, CheckCircle2, FileCode2, Github, Terminal, Info, Server, Layers, BookOpen, Key, CheckSquare, Webhook, ArrowRight, Smartphone, Settings, Paintbrush, Braces, Play } from 'lucide-react';

export default function App() {
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'guide' | 'action' | 'script' | 'backend' | 'tester'>('tester');

  // State untuk form tester PPOB
  const [testConfig, setTestConfig] = useState({
    appName: 'QianPulsa Demo',
    packageName: 'com.qianpulsa.demo',
    versionCode: 1,
    versionName: '1.0.0',
    primaryColor: '#1E3A8A',
    accentColor: '#3B82F6',
    iconUrl: 'https://ui-avatars.com/api/?name=QP&background=1E3A8A&color=fff',
    splashUrl: '',
    apiUrl: 'https://api.qianpulsa.com/seller/demo123'
  });

  const githubActionCode = `name: Build & Sign PPOB White-Label

on:
  workflow_dispatch:
    inputs:
      sellerId:
        description: 'ID Seller di Database'
        required: true
      templateId:
        description: 'ID Template (contoh: app-v1)'
        required: true
        default: 'app-v1'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository (Templates & Scripts)
        uses: actions/checkout@v4

      - name: Setup Node.js (Untuk Script Builder)
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Install Builder Dependencies
        run: npm install axios xml2js # Library untuk HTTP Request & Parsing XML di builder script

      - name: Fetch Config & Modify Android Source Code
        env:
          QIANPULSA_API_KEY: \${{ secrets.QIANPULSA_API_KEY }}
        run: node scripts/builder.js \${{ github.event.inputs.sellerId }} \${{ github.event.inputs.templateId }}

      - name: Build Release APK
        run: |
          cd apps/\${{ github.event.inputs.templateId }}
          chmod +x ./gradlew
          ./gradlew assembleRelease

      - name: Setup Android Build Tools
        run: |
          BUILD_TOOLS=$(ls -d $ANDROID_SDK_ROOT/build-tools/* | sort -V | tail -n 1)
          echo "BUILD_TOOLS=$BUILD_TOOLS" >> $GITHUB_ENV

      - name: Sign APK
        run: |
          # builder.js akan menghasilkan file keystore.jks di folder root jika seller sudah punya,
          # atau akan men-generate baru jika belum ada dan menyimpannya sebagai new_keystore_base64.txt
          
          cd apps/\${{ github.event.inputs.templateId }}
          APK_FILE=$(find app/build/outputs/apk/release -name "*.apk" | head -n 1)
          ALIGNED_APK="/tmp/aligned.apk"
          SIGNED_APK="signed-app-\${{ github.event.inputs.sellerId }}.apk"
          
          $BUILD_TOOLS/zipalign -v -p 4 "$APK_FILE" "$ALIGNED_APK"
          $BUILD_TOOLS/apksigner sign \\
            --ks ../../keystore.jks \\
            --ks-key-alias "key0" \\
            --ks-pass "pass:qianpulsapass" \\
            --key-pass "pass:qianpulsapass" \\
            --out "../../$SIGNED_APK" \\
            "$ALIGNED_APK"
            
          echo "SIGNED_APK_PATH=$SIGNED_APK" >> $GITHUB_ENV

      - name: Upload Signed APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: release-\${{ github.event.inputs.sellerId }}
          path: \${{ env.SIGNED_APK_PATH }}
          retention-days: 7

      - name: Trigger Webhook ke Dashboard QianPulsa
        env:
          QIANPULSA_API_KEY: \${{ secrets.QIANPULSA_API_KEY }}
        run: |
          # Ambil base64 keystore baru jika ada (digenerate oleh builder.js)
          NEW_KS=""
          if [ -f new_keystore_base64.txt ]; then
            NEW_KS=$(cat new_keystore_base64.txt)
          fi

          curl -X POST "https://api.qianpulsa.com/api/webhook/github-build" \\
          -H "Content-Type: application/json" \\
          -H "x-api-key: $QIANPULSA_API_KEY" \\
          -d "{
            \\"sellerId\\": \\"\${{ github.event.inputs.sellerId }}\\",
            \\"status\\": \\"COMPLETED\\",
            \\"runId\\": \\"\${{ github.run_id }}\\",
            \\"newKeystoreBase64\\": \\"$NEW_KS\\"
          }"`;

  const scriptBuilderCode = `// File: scripts/builder.js
// Script Node.js yang dieksekusi di dalam runner GitHub Actions

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
    console.log(\`Mengambil konfigurasi untuk Seller: \${sellerId}\`);
    
    // 1. Ambil data konfigurasi toko dari backend
    const response = await axios.get(\`\${API_BASE_URL}/config/\${sellerId}\`, {
      headers: { 'x-api-key': API_KEY }
    });
    const config = response.data.data;
    
    const appDir = path.join(__dirname, '..', 'apps', templateId);
    
    // 2. Modifikasi Package Name (build.gradle)
    const buildGradlePath = path.join(appDir, 'app', 'build.gradle');
    let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
    buildGradle = buildGradle.replace(/applicationId\\s+".*"/, \`applicationId "\${config.packageName}"\`);
    buildGradle = buildGradle.replace(/versionCode\\s+\\d+/, \`versionCode \${config.versionCode}\`);
    buildGradle = buildGradle.replace(/versionName\\s+".*"/, \`versionName "\${config.versionName}"\`);
    fs.writeFileSync(buildGradlePath, buildGradle);
    console.log('✅ Package name & Version diupdate.');

    // 3. Modifikasi App Name (strings.xml)
    const stringsXmlPath = path.join(appDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
    let stringsXml = fs.readFileSync(stringsXmlPath, 'utf8');
    stringsXml = stringsXml.replace(/<string name="app_name">.*<\\/string>/, \`<string name="app_name">\${config.appName}<\\/string>\`);
    fs.writeFileSync(stringsXmlPath, stringsXml);
    console.log('✅ App Name diupdate.');

    // 4. Modifikasi Warna (colors.xml)
    const colorsXmlPath = path.join(appDir, 'app', 'src', 'main', 'res', 'values', 'colors.xml');
    let colorsXml = fs.readFileSync(colorsXmlPath, 'utf8');
    colorsXml = colorsXml.replace(/<color name="colorPrimary">.*<\\/color>/, \`<color name="colorPrimary">\${config.primaryColor}<\\/color>\`);
    colorsXml = colorsXml.replace(/<color name="colorAccent">.*<\\/color>/, \`<color name="colorAccent">\${config.accentColor}<\\/color>\`);
    fs.writeFileSync(colorsXmlPath, colorsXml);
    console.log('✅ Warna tema diupdate.');

    // 5. Download & Replace Icon/Splash (Contoh sederhana)
    // Di produksi, gunakan library seperti sharp atau alat command line (imagemagick) 
    // untuk me-resize icon ke berbagai resolusi mipmap (hdpi, xhdpi, dll)
    if (config.iconUrl) {
      console.log('Mendownload icon...');
      // curl config.iconUrl > app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
    }

    // 6. Siapkan Keystore
    const keystorePath = path.join(__dirname, '..', 'keystore.jks');
    if (config.keystoreBase64) {
      console.log('Menggunakan keystore lama dari DB...');
      fs.writeFileSync(keystorePath, Buffer.from(config.keystoreBase64, 'base64'));
    } else {
      console.log('Generate keystore baru...');
      execSync(\`keytool -genkey -v -keystore \${keystorePath} -alias key0 -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=\${config.appName}, OU=QianPulsa, C=ID" -storepass qianpulsapass -keypass qianpulsapass\`);
      const newBase64 = fs.readFileSync(keystorePath).toString('base64');
      fs.writeFileSync(path.join(__dirname, '..', 'new_keystore_base64.txt'), newBase64);
    }

    console.log('✅ Konfigurasi selesai. Siap dibuild.');
  } catch (error) {
    console.error('❌ Gagal menyiapkan build:', error.message);
    process.exit(1);
  }
}

main();`;

  const backendEndpointCode = `import express from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();
const router = express.Router();

// Middleware Autentikasi Internal (Hanya boleh diakses oleh GitHub Action)
const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
};

/**
 * [GET] /api/builder/config/:sellerId
 * Dipanggil oleh scripts/builder.js di dalam GitHub Actions.
 * Mengirimkan semua data konfigurasi APK untuk seller.
 */
router.get('/builder/config/:sellerId', requireApiKey, async (req, res) => {
  const { sellerId } = req.params;
  
  const appConfig = await prisma.sellerAppConfig.findUnique({
    where: { sellerId }
  });

  if (!appConfig) return res.status(404).json({ error: 'Config not found' });

  // Data yang dikirim ke GitHub Action
  res.json({
    data: {
      appName: appConfig.appName, // ex: "Budi Pay"
      packageName: appConfig.packageName, // ex: "com.qianpulsa.budipay"
      versionCode: appConfig.versionCode,
      versionName: appConfig.versionName,
      primaryColor: appConfig.primaryColor, // ex: "#1E3A8A"
      accentColor: appConfig.accentColor,
      iconUrl: appConfig.iconUrl, // URL S3/Cloud Storage
      splashScreenUrl: appConfig.splashUrl,
      apiUrl: \`https://api.qianpulsa.com/seller/\${sellerId}\`, // Endpoint khusus
      keystoreBase64: appConfig.keystoreBase64 // null jika belum ada
    }
  });
});

/**
 * [POST] /api/webhook/github-build
 * Dipanggil setelah GitHub Action selesai mem-build dan sign APK.
 */
router.post('/webhook/github-build', requireApiKey, async (req, res) => {
  const { sellerId, status, runId, newKeystoreBase64 } = req.body;
  
  if (status === 'COMPLETED') {
    const updateData: any = {
      buildStatus: 'READY',
      latestGithubRunId: runId
    };
    
    // Jika github men-generate keystore baru, simpan ke database
    if (newKeystoreBase64) {
      updateData.keystoreBase64 = newKeystoreBase64;
    }

    await prisma.sellerAppConfig.update({
      where: { sellerId },
      data: updateData
    });
  }
  
  res.json({ success: true });
});

export default router;`;

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(id);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">QianPulsa Admin</h1>
              <p className="text-xs text-slate-500 font-medium">Single-Repo Architecture (Data-Driven Build)</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 bg-slate-200/50 p-1.5 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'guide' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Arsitektur & Konsep
          </button>
          <button
            onClick={() => setActiveTab('action')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'action' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            GitHub Workflow
          </button>
          <button
            onClick={() => setActiveTab('script')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'script' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Braces className="w-4 h-4" />
            Builder Script (Node.js)
          </button>
          <button
            onClick={() => setActiveTab('backend')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'backend' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Server className="w-4 h-4" />
            API Backend
          </button>
          <button
            onClick={() => setActiveTab('tester')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'tester' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Play className="w-4 h-4" />
            Simulasi PPOB (Tester)
          </button>
        </div>

        {activeTab === 'guide' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            
            {/* Visual Flow Diagram */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between text-center overflow-x-auto gap-4 md:gap-0">
                <div className="flex flex-col items-center min-w-[140px]">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                        <Server className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">1. Trigger Build</span>
                    <span className="text-[10px] text-slate-500">Dashboard memanggil GitHub API dengan sellerId</span>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 hidden md:block" />
                <div className="flex flex-col items-center min-w-[140px]">
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
                        <Braces className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">2. Fetch & Modify</span>
                    <span className="text-[10px] text-slate-500">Script GitHub mengambil data konfigurasi dari Backend</span>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 hidden md:block" />
                <div className="flex flex-col items-center min-w-[140px]">
                    <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mb-2">
                        <Smartphone className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">3. Build & Sign</span>
                    <span className="text-[10px] text-slate-500">Gradle assemble & apksigner</span>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 hidden md:block" />
                <div className="flex flex-col items-center min-w-[140px]">
                    <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mb-2">
                        <Webhook className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">4. Webhook</span>
                    <span className="text-[10px] text-slate-500">Kirim status & Keystore baru ke DB</span>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Arsitektur Data-Driven (Satu Repository)</h2>
                <p className="text-sm text-slate-500 mt-1">Ide yang sangat bagus! Kita tidak perlu mengirimkan banyak parameter melalui GitHub API. Cukup kirimkan <code>sellerId</code>, lalu biarkan runner GitHub (melalui Node.js script) yang "menarik" (pull) data konfigurasi lengkap dari API Anda.</p>
              </div>
              
              <div className="p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-slate-400" />
                  Data Konfigurasi yang Diperlukan di Database (Schema Prisma)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Identitas */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <h4 className="font-semibold text-sm text-slate-800 mb-3 border-b pb-2">Identitas & Build</h4>
                    <ul className="space-y-2 text-sm text-slate-600">
                      <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">appName</span> : Nama Aplikasi (mis. "Toko Budi")</li>
                      <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">packageName</span> : Unik per seller (mis. "com.qianpulsa.budi")</li>
                      <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">versionCode</span> : Integer (Auto-increment per build)</li>
                      <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">versionName</span> : String (mis. "1.0.0")</li>
                    </ul>
                  </div>

                  {/* Visual & Aset */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <h4 className="font-semibold text-sm text-slate-800 mb-3 border-b pb-2 flex items-center gap-2">
                      <Paintbrush className="w-4 h-4" /> Visual & Branding
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-600">
                      <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">primaryColor</span> : Hex code (mis. "#1E3A8A")</li>
                      <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">accentColor</span> : Hex code</li>
                      <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">iconUrl</span> : URL gambar dari S3/Cloud Storage (wajib PNG/WEBP)</li>
                      <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">splashUrl</span> : URL gambar splash screen</li>
                    </ul>
                  </div>

                  {/* Sistem & Keamanan */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 md:col-span-2">
                    <h4 className="font-semibold text-sm text-slate-800 mb-3 border-b pb-2 flex items-center gap-2">
                      <Key className="w-4 h-4" /> Sistem, API & Keamanan
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ul className="space-y-2 text-sm text-slate-600">
                        <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">apiUrl</span> : Endpoint backend khusus toko ini</li>
                        <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">onesignalId</span> : (Opsional) Push notification</li>
                        <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">googleServicesJson</span> : (Opsional) Firebase config URL</li>
                      </ul>
                      <ul className="space-y-2 text-sm text-slate-600 border-l pl-4 border-slate-200">
                        <li><span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded">keystoreBase64</span> : Tanda tangan digital. (Jika NULL, GitHub akan menggenerate baru dan mengembalikannya ke database via Webhook).</li>
                      </ul>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Tab Action */}
        {activeTab === 'action' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex items-start gap-4">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-blue-900">.github/workflows/build-and-sign.yml</h3>
                <p className="text-sm text-blue-800 mt-1">
                  Workflow ini berada di repository utama. Ia memicu script Node.js (<code>builder.js</code>) untuk melakukan modifikasi <i>source code</i>, lalu menjalankan Gradle, menandatanganinya, dan memberikan laporan (webhook).
                </p>
              </div>
            </div>

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-mono text-slate-200">build-and-sign.yml</span>
                </div>
                <button
                  onClick={() => handleCopy(githubActionCode, 'action')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs font-medium"
                >
                  {copiedFile === 'action' ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Tersalin</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Salin Kode</>
                  )}
                </button>
              </div>
              <div className="p-4 overflow-x-auto bg-[#0d1117] max-h-[500px] overflow-y-auto">
                <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                  <code>{githubActionCode}</code>
                </pre>
              </div>
            </section>
          </div>
        )}

        {/* Tab Script Builder */}
        {activeTab === 'script' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-5 flex items-start gap-4">
              <Braces className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-purple-900">scripts/builder.js</h3>
                <p className="text-sm text-purple-800 mt-1">
                  Ini adalah rahasia utama dari arsitektur ini. Karena GitHub runner sudah memiliki Node.js, kita bisa menggunakan script ini untuk mengambil data API dan melakukan manipulasi file (Regex replace pada <code>build.gradle</code>, <code>strings.xml</code>, <code>colors.xml</code>) sebelum Android Studio / Gradle melakukan kompilasi.
                </p>
              </div>
            </div>

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-mono text-slate-200">scripts/builder.js</span>
                </div>
                <button
                  onClick={() => handleCopy(scriptBuilderCode, 'script')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs font-medium"
                >
                  {copiedFile === 'script' ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Tersalin</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Salin Kode</>
                  )}
                </button>
              </div>
              <div className="p-4 overflow-x-auto bg-[#0d1117] max-h-[500px] overflow-y-auto">
                <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                  <code>{scriptBuilderCode}</code>
                </pre>
              </div>
            </section>
          </div>
        )}

        {/* Tab Backend */}
        {activeTab === 'backend' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex items-start gap-4">
              <Server className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-emerald-900">API Penyedia Konfigurasi & Penerima Webhook</h3>
                <p className="text-sm text-emerald-800 mt-1">
                  Buat 2 endpoint baru di backend Express Anda. Satu untuk melayani (serve) data konfigurasi kepada GitHub runner saat di-request. Satu lagi untuk menerima notifikasi saat build sudah selesai beserta data keystore barunya.
                </p>
              </div>
            </div>

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-mono text-slate-200">src/routes/builderApi.ts</span>
                </div>
                <button
                  onClick={() => handleCopy(backendEndpointCode, 'node')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs font-medium"
                >
                  {copiedFile === 'node' ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Tersalin</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Salin Kode</>
                  )}
                </button>
              </div>
              <div className="p-4 overflow-x-auto bg-[#0d1117] max-h-[500px] overflow-y-auto">
                <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                  <code>{backendEndpointCode}</code>
                </pre>
              </div>
            </section>
          </div>
        )}

        {/* Tab Tester (Simulasi) */}
        {activeTab === 'tester' && (
          <div className="animate-in fade-in duration-300">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex items-start gap-4 mb-6">
              <Play className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-indigo-900">Uji Coba Visual Aplikasi Seller (White-Label)</h3>
                <p className="text-sm text-indigo-800 mt-1">
                  Ubah konfigurasi di bawah ini untuk melihat bagaimana tampilan aplikasi seller akan berubah secara dinamis (Data-Driven). Parameter ini yang akan dikirim ke script GitHub Actions.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Kolom Kiri: Form Konfigurasi */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Section: Identitas & Build */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-slate-400" /> Identitas & Build
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Nama Aplikasi (appName)</label>
                      <input 
                        type="text" 
                        value={testConfig.appName}
                        onChange={e => setTestConfig({...testConfig, appName: e.target.value})}
                        className="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Package Name</label>
                      <input 
                        type="text" 
                        value={testConfig.packageName}
                        onChange={e => setTestConfig({...testConfig, packageName: e.target.value})}
                        className="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Version Code</label>
                      <input 
                        type="number" 
                        value={testConfig.versionCode}
                        onChange={e => setTestConfig({...testConfig, versionCode: parseInt(e.target.value) || 1})}
                        className="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Version Name</label>
                      <input 
                        type="text" 
                        value={testConfig.versionName}
                        onChange={e => setTestConfig({...testConfig, versionName: e.target.value})}
                        className="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Visual & Branding */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Paintbrush className="w-4 h-4 text-slate-400" /> Visual & Branding
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Warna Utama (primaryColor)</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          value={testConfig.primaryColor}
                          onChange={e => setTestConfig({...testConfig, primaryColor: e.target.value})}
                          className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                        />
                        <input 
                          type="text" 
                          value={testConfig.primaryColor}
                          onChange={e => setTestConfig({...testConfig, primaryColor: e.target.value})}
                          className="flex-1 border border-slate-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono uppercase"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Warna Aksen (accentColor)</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          value={testConfig.accentColor}
                          onChange={e => setTestConfig({...testConfig, accentColor: e.target.value})}
                          className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                        />
                        <input 
                          type="text" 
                          value={testConfig.accentColor}
                          onChange={e => setTestConfig({...testConfig, accentColor: e.target.value})}
                          className="flex-1 border border-slate-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono uppercase"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Sistem, API & Keamanan */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Key className="w-4 h-4 text-slate-400" /> Sistem, API & Keamanan
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">API Endpoint Backend (apiUrl)</label>
                    <input 
                      type="text" 
                      value={testConfig.apiUrl}
                      onChange={e => setTestConfig({...testConfig, apiUrl: e.target.value})}
                      className="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Aplikasi Android akan menggunakan URL ini untuk mengambil data produk, transaksi, dll.</p>
                  </div>
                </div>

                {/* Simulated Output JSON */}
                <div className="bg-slate-900 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-300">Simulasi JSON Response (Endpoint /api/builder/config/:id)</span>
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <pre className="text-xs text-green-400 font-mono">
                      {JSON.stringify({ data: testConfig }, null, 2)}
                    </pre>
                  </div>
                </div>

              </div>

              {/* Kolom Kanan: Mockup Smartphone */}
              <div className="lg:col-span-5 flex justify-center lg:justify-end">
                <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[8px] rounded-[2.5rem] h-[600px] w-[300px] shadow-2xl">
                  {/* Notch */}
                  <div className="w-[100px] h-[24px] bg-gray-800 absolute top-0 left-1/2 -translate-x-1/2 rounded-b-[1rem] z-20 flex justify-center items-center">
                     <div className="w-12 h-1.5 bg-gray-900 rounded-full"></div>
                  </div>
                  
                  {/* Screen Content */}
                  <div className="rounded-[2rem] overflow-hidden w-full h-full bg-slate-50 relative flex flex-col">
                    
                    {/* App Header (Primary Color) */}
                    <div 
                      className="pt-10 pb-4 px-4 shadow-md z-10 transition-colors duration-300 flex items-center gap-3"
                      style={{ backgroundColor: testConfig.primaryColor }}
                    >
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        <img 
                          src={testConfig.iconUrl.replace('1E3A8A', testConfig.primaryColor.replace('#', ''))} 
                          alt="App Icon" 
                          className="w-full h-full rounded-full object-cover" 
                        />
                      </div>
                      <div className="text-white font-bold text-lg truncate">
                        {testConfig.appName}
                      </div>
                    </div>

                    {/* App Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      
                      {/* Dashboard Card (Accent Color) */}
                      <div 
                        className="rounded-xl p-4 text-white shadow-lg relative overflow-hidden transition-colors duration-300"
                        style={{ backgroundColor: testConfig.accentColor }}
                      >
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full"></div>
                        <div className="absolute -left-4 -bottom-4 w-16 h-16 bg-white/10 rounded-full"></div>
                        <p className="text-xs text-white/80 font-medium mb-1">Sisa Saldo</p>
                        <h2 className="text-2xl font-bold">Rp 1.250.000</h2>
                        <div className="mt-3 flex gap-2">
                          <button className="bg-white/20 hover:bg-white/30 text-white text-xs py-1.5 px-3 rounded-lg font-medium transition-colors">
                            + Isi Saldo
                          </button>
                          <button className="bg-white/20 hover:bg-white/30 text-white text-xs py-1.5 px-3 rounded-lg font-medium transition-colors">
                            Transfer
                          </button>
                        </div>
                      </div>

                      {/* Mock Menus */}
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { name: 'Pulsa', icon: '📱' },
                          { name: 'Data', icon: '🌐' },
                          { name: 'Listrik', icon: '⚡' },
                          { name: 'Game', icon: '🎮' },
                          { name: 'E-Money', icon: '💳' },
                          { name: 'PDAM', icon: '💧' },
                          { name: 'BPJS', icon: '🏥' },
                          { name: 'Lainnya', icon: '•••' }
                        ].map((menu, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1.5 cursor-pointer">
                            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center border border-slate-100 text-xl hover:scale-105 transition-transform">
                              {menu.icon}
                            </div>
                            <span className="text-[10px] text-slate-600 font-medium">{menu.name}</span>
                          </div>
                        ))}
                      </div>

                      {/* Latest Transactions */}
                      <div>
                        <h3 className="text-xs font-bold text-slate-800 mb-2 mt-2">Transaksi Terakhir</h3>
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-100">
                          {[
                            { name: 'Pulsa Telkomsel 50rb', price: 'Rp 50.500', status: 'Sukses', color: 'text-green-600' },
                            { name: 'Token PLN 100rb', price: 'Rp 100.200', status: 'Pending', color: 'text-orange-500' },
                            { name: 'Topup OVO', price: 'Rp 20.000', status: 'Gagal', color: 'text-red-500' }
                          ].map((trx, idx) => (
                            <div key={idx} className="p-3 flex justify-between items-center">
                              <div>
                                <p className="text-xs font-medium text-slate-800">{trx.name}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">Hari ini, 14:30</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-slate-800">{trx.price}</p>
                                <p className={`text-[10px] font-medium mt-0.5 ${trx.color}`}>{trx.status}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                    
                    {/* Bottom Navigation */}
                    <div className="h-14 bg-white border-t border-slate-200 flex justify-around items-center px-2">
                      <div className="flex flex-col items-center gap-1 cursor-pointer">
                        <div className="w-5 h-5 rounded" style={{ backgroundColor: testConfig.primaryColor, maskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27currentColor%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z%27/%3E%3Cpolyline points=%279 22 9 12 15 12 15 22%27/%3E%3C/svg%3E")', WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27currentColor%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z%27/%3E%3Cpolyline points=%279 22 9 12 15 12 15 22%27/%3E%3C/svg%3E")', maskSize: 'cover', WebkitMaskSize: 'cover' }}></div>
                        <span className="text-[9px] font-bold" style={{ color: testConfig.primaryColor }}>Home</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 cursor-pointer opacity-50">
                        <div className="w-5 h-5 bg-slate-500 rounded" style={{ maskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27currentColor%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z%27/%3E%3Cpolyline points=%2714 2 14 8 20 8%27/%3E%3Cline x1=%2716%27 y1=%2713%27 x2=%278%27 y2=%2713%27/%3E%3Cline x1=%2716%27 y1=%2717%27 x2=%278%27 y2=%2717%27/%3E%3Cpolyline points=%2710 9 9 9 8 9%27/%3E%3C/svg%3E")', WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27currentColor%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z%27/%3E%3Cpolyline points=%2714 2 14 8 20 8%27/%3E%3Cline x1=%2716%27 y1=%2713%27 x2=%278%27 y2=%2713%27/%3E%3Cline x1=%2716%27 y1=%2717%27 x2=%278%27 y2=%2717%27/%3E%3Cpolyline points=%2710 9 9 9 8 9%27/%3E%3C/svg%3E")', maskSize: 'cover', WebkitMaskSize: 'cover' }}></div>
                        <span className="text-[9px] font-medium text-slate-500">Riwayat</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 cursor-pointer opacity-50">
                        <div className="w-5 h-5 bg-slate-500 rounded" style={{ maskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27currentColor%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2%27/%3E%3Ccircle cx=%2712%27 cy=%277%27 r=%274%27/%3E%3C/svg%3E")', WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27currentColor%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2%27/%3E%3Ccircle cx=%2712%27 cy=%277%27 r=%274%27/%3E%3C/svg%3E")', maskSize: 'cover', WebkitMaskSize: 'cover' }}></div>
                        <span className="text-[9px] font-medium text-slate-500">Akun</span>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>
    </div>
  );
}

