import React, { useState } from 'react';
import { Copy, CheckCircle2, FileCode2, Github, Terminal, Info, Server, Layers, BookOpen, GitBranch, Key, CheckSquare, Webhook } from 'lucide-react';

export default function App() {
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'action' | 'backend' | 'guide'>('guide');

  const actionYmlCode = `name: 'QianPulsa Android Signer'
description: 'Custom GitHub Action untuk menandatangani APK/AAB QianPulsa secara mandiri.'
author: 'QianPulsa'

inputs:
  release_dir:
    description: 'Direktori tempat build APK/AAB berada (contoh: app/build/outputs/apk/release)'
    required: true
  signing_key:
    description: 'Base64 string dari file keystore (.jks atau .keystore). Kosongkan jika ingin generate otomatis.'
    required: false
    default: ''
  alias:
    description: 'Alias dari key yang ada di dalam keystore'
    required: true
  key_store_password:
    description: 'Password untuk membuka keystore'
    required: true
  key_password:
    description: 'Password spesifik untuk key alias'
    required: true
  seller_id:
    description: 'ID Seller (digunakan untuk generate nama file keystore unik jika otomatis)'
    required: false
    default: 'seller_default'
  seller_name:
    description: 'Nama Seller (digunakan untuk informasi CN pada sertifikat)'
    required: false
    default: 'QianPulsa Partner'

outputs:
  signed_release_file:
    description: 'Path absolut ke file APK/AAB yang sudah berhasil ditandatangani'
    value: \${{ steps.sign_app.outputs.signed_file }}
  generated_keystore_base64:
    description: 'Base64 keystore baru jika digenerate otomatis (simpan ke DB untuk update APK di masa depan)'
    value: \${{ steps.generate_keystore.outputs.base64_ks }}

runs:
  using: 'composite'
  steps:
    - name: Setup direktori dan Keystore
      id: generate_keystore
      shell: bash
      run: |
        if [ -n "\${{ inputs.signing_key }}" ]; then
          echo "Menggunakan keystore dari input (sudah ada)..."
          echo "\${{ inputs.signing_key }}" | base64 --decode > /tmp/signing_keystore.jks
        else
          echo "Membuat keystore baru secara dinamis untuk Seller: \${{ inputs.seller_id }}..."
          keytool -genkey -v \\
            -keystore /tmp/signing_keystore.jks \\
            -alias "\${{ inputs.alias }}" \\
            -keyalg RSA -keysize 2048 -validity 10000 \\
            -dname "CN=\${{ inputs.seller_name }}, OU=QianPulsa Partner, O=QianPulsa, L=Jakarta, ST=DKI Jakarta, C=ID" \\
            -storepass "\${{ inputs.key_store_password }}" \\
            -keypass "\${{ inputs.key_password }}"
            
          # Export base64 keystore baru agar bisa dikirim kembali ke Webhook Backend
          BASE64_KS=$(base64 -w 0 /tmp/signing_keystore.jks)
          echo "base64_ks=$BASE64_KS" >> $GITHUB_OUTPUT
        fi

    - name: Sign APK / AAB
      id: sign_app
      shell: bash
      run: |
        APP_FILE=$(find \${{ inputs.release_dir }} -type f \\( -name "*.apk" -o -name "*.aab" \\) | head -n 1)
        
        if [ -z "$APP_FILE" ]; then
          echo "Error: Tidak ada file APK/AAB yang ditemukan."
          exit 1
        fi
        
        BUILD_TOOLS=$(ls -d $ANDROID_SDK_ROOT/build-tools/* | sort -V | tail -n 1)
        ALIGNED_FILE="/tmp/aligned-app.apk"
        SIGNED_FILE="\${APP_FILE%.*}-signed.\${APP_FILE##*.}"
        
        $BUILD_TOOLS/zipalign -v -p 4 "$APP_FILE" "$ALIGNED_FILE"
        
        $BUILD_TOOLS/apksigner sign \\
          --ks /tmp/signing_keystore.jks \\
          --ks-key-alias "\${{ inputs.alias }}" \\
          --ks-pass "pass:\${{ inputs.key_store_password }}" \\
          --key-pass "pass:\${{ inputs.key_password }}" \\
          --out "$SIGNED_FILE" \\
          "$ALIGNED_FILE"
          
        $BUILD_TOOLS/apksigner verify "$SIGNED_FILE"
        echo "signed_file=$SIGNED_FILE" >> $GITHUB_OUTPUT
        
    - name: Cleanup Keystore
      shell: bash
      if: always()
      run: |
        rm -f /tmp/signing_keystore.jks
        rm -f /tmp/aligned-app.apk`;

  const nodeJsWorkerCode = `import { Worker, Job } from 'bullmq';
import axios from 'axios';
import Redis from 'ioredis';

// Konfigurasi Redis QianPulsa
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

interface BuildApkPayload {
  sellerId: string;
  appName: string;
  appPackage: string;
  existingKeystoreBase64?: string; // Dapat dari DB (Prisma)
}

/**
 * Worker BullMQ: Menerima antrean pembuatan APK dari Dashboard Seller
 * dan memicu GitHub Actions REST API untuk mem-build & sign APK.
 */
export const apkBuilderWorker = new Worker<BuildApkPayload>(
  'QianPulsa-APK-Build-Queue',
  async (job: Job) => {
    const { sellerId, appName, appPackage, existingKeystoreBase64 } = job.data;

    try {
      console.log(\`[Worker] Memulai build APK untuk Seller: \${sellerId}\`);

      // 1. Memanggil GitHub Actions REST API (workflow_dispatch)
      const GITHUB_TOKEN = process.env.GITHUB_PAT;
      const REPO_OWNER = process.env.GITHUB_ORG_NAME; // Cth: 'QianPulsa'
      const REPO_NAME = 'android-whitelabel-template';
      const WORKFLOW_ID = 'build-and-sign.yml';

      const response = await axios.post(
        \`https://api.github.com/repos/\${REPO_OWNER}/\${REPO_NAME}/actions/workflows/\${WORKFLOW_ID}/dispatches\`,
        {
          ref: 'main',
          inputs: {
            sellerId: sellerId,
            sellerName: appName,
            existingKeystore: existingKeystoreBase64 || ''
          }
        },
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: \`Bearer \${GITHUB_TOKEN}\`
          }
        }
      );

      if (response.status === 204) {
        console.log(\`[Worker] Workflow GitHub berhasil dipicu untuk \${sellerId}.\`);
      }

    } catch (error: any) {
      console.error(\`[Worker] Gagal memicu GitHub Action:\`, error.response?.data || error.message);
      throw error;
    }
  },
  { connection: redisConnection }
);

// Listener untuk memantau status antrean
apkBuilderWorker.on('completed', (job) => {
  console.log(\`Job \${job.id} selesai. Build dalam proses di GitHub.\`);
});

apkBuilderWorker.on('failed', (job, err) => {
  console.log(\`Job \${job?.id} gagal:\`, err);
});`;

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(id);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header Admin */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">QianPulsa Admin</h1>
              <p className="text-xs text-slate-500 font-medium">Platform Arsitektur & Konfigurasi</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'guide' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Panduan Developer
          </button>
          <button
            onClick={() => setActiveTab('action')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'action' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            GitHub Action (Signer)
          </button>
          <button
            onClick={() => setActiveTab('backend')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'backend' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className="w-4 h-4" />
            Node.js (Backend Worker)
          </button>
        </div>

        {activeTab === 'guide' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Alur Integrasi & Automasi Build APK</h2>
                <p className="text-sm text-slate-500 mt-1">Panduan langkah demi langkah untuk developer (Backend & DevOps) QianPulsa.</p>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Step 1 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
                    1
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-slate-400" />
                      Export Proyek Ini ke GitHub (Jadikan Action Repo)
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Karena proyek ini sudah berisi file <code>action.yml</code> di direktori utamanya (root), Anda hanya perlu melakukan <strong>Export ke GitHub</strong> melalui menu pengaturan di AI Studio. Repository hasil export akan langsung berfungsi sebagai Custom GitHub Action Anda sendiri.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
                    2
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-slate-400" />
                      Buat Workflow Build di Template Android PPOB
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Di repository template aplikasi Android Anda (contoh: <code>QianPulsa/android-whitelabel-template</code>), buat file workflow baru <code>.github/workflows/build-and-sign.yml</code> dan gunakan action dari repository yang baru saja di-export tadi (misalnya repo Anda bernama <code>QianPulsa/qianpulsa-apk-signer</code>):
                    </p>
                    <pre className="mt-3 p-3 bg-slate-900 text-slate-300 text-xs font-mono rounded-lg overflow-x-auto">
{`jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./gradlew assembleRelease
      
      # Panggil custom action (Signer) yang baru di-export
      - uses: username-anda/nama-repo-hasil-export@main
        id: sign
        with:
          release_dir: app/build/outputs/apk/release
          signing_key: \${{ github.event.inputs.existingKeystore }}
          seller_id: \${{ github.event.inputs.sellerId }}
          seller_name: \${{ github.event.inputs.sellerName }}
          alias: 'key0'
          key_store_password: 'qianpulsapass'
          key_password: 'qianpulsapass'`}
                    </pre>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
                    3
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Key className="w-4 h-4 text-slate-400" />
                      Dynamic Keystore Generation
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Action secara otomatis menggunakan Java <code>keytool</code> untuk membuat file <code>.jks</code> baru jika backend tidak mengirimkan keystore lama. Data seperti nama entitas (CN) di sertifikat akan disesuaikan dengan ID dan Nama Seller.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
                    4
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Server className="w-4 h-4 text-slate-400" />
                      Setup PAT & Integrasi Backend Node.js
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Buat <strong>Personal Access Token (PAT)</strong> di GitHub dengan akses <code>repo</code> dan <code>workflow</code>. Simpan di backend (<code>.env</code>) sebagai <code>GITHUB_PAT</code>. Gunakan kode dari tab <strong>Node.js (Backend Worker)</strong> untuk memicu (trigger) API GitHub <code>workflow_dispatch</code> setiap kali Seller mengklik tombol "Build APK" di dashboard.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
                    5
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Webhook className="w-4 h-4 text-slate-400" />
                      Terima Callback URL APK (Webhook)
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Sebagai sentuhan akhir, tambahkan step di <code>build-and-sign.yml</code> untuk mengirimkan HTTP POST (Webhook) kembali ke backend Node.js (Express) QianPulsa mengabarkan bahwa build selesai beserta link download artifacts-nya. Backend lalu mengupdate record Prisma Seller menjadi <code>COMPLETED</code>.
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {activeTab === 'action' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex items-start gap-4">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-blue-900">Mandiri & Terisolasi</h3>
                <p className="text-sm text-blue-800 mt-1">
                  Gunakan kode <code>action.yml</code> ini dalam repository rahasia (private) pada organisasi GitHub Anda. Pastikan versi (tag) digunakan saat memanggil action ini dari repository aplikasi Android (contoh: <code>uses: QianPulsa/android-signer@v1.0.0</code>).
                </p>
              </div>
            </div>

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-mono text-slate-200">action.yml</span>
                </div>
                <button
                  onClick={() => handleCopy(actionYmlCode, 'action')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs font-medium"
                >
                  {copiedFile === 'action' ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Tersalin</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Salin Kode</>
                  )}
                </button>
              </div>
              <div className="p-4 overflow-x-auto bg-[#0d1117]">
                <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                  <code>{actionYmlCode}</code>
                </pre>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'backend' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex items-start gap-4">
              <Server className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-emerald-900">Alur Eksekusi White-Label PPOB</h3>
                <p className="text-sm text-emerald-800 mt-1">
                  Backend menerima request build APK dari Seller, lalu memasukkannya ke antrean <strong>Redis + BullMQ</strong>. Worker akan mengambil job tersebut dan menembak <strong>GitHub Actions REST API</strong> (<code>workflow_dispatch</code>). Di dalam GitHub, Action kustom (Signer) yang Anda buat sebelumnya akan dieksekusi.
                </p>
              </div>
            </div>

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-mono text-slate-200">src/workers/githubBuilder.ts</span>
                </div>
                <button
                  onClick={() => handleCopy(nodeJsWorkerCode, 'node')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs font-medium"
                >
                  {copiedFile === 'node' ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Tersalin</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Salin Kode</>
                  )}
                </button>
              </div>
              <div className="p-4 overflow-x-auto bg-[#0d1117]">
                <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                  <code>{nodeJsWorkerCode}</code>
                </pre>
              </div>
            </section>
          </div>
        )}

      </main>
    </div>
  );
}

