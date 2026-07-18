import React, { useState } from 'react';
import { Copy, CheckCircle2, FileCode2, Github, Terminal, Info, Server, Layers, BookOpen, GitBranch, Key, CheckSquare, Webhook, ArrowRight, Smartphone } from 'lucide-react';

export default function App() {
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'guide' | 'repoA' | 'repoB' | 'backend'>('guide');

  const repoAWorkflowCode = `name: Build Unsigned APK

on:
  workflow_dispatch:
    inputs:
      sellerId:
        required: true
      sellerName:
        required: true
      existingKeystore:
        required: false

jobs:
  build_apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Template Code
        uses: actions/checkout@v4
      
      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Build Unsigned Release APK
        run: ./gradlew assembleRelease

      - name: Upload Unsigned APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: unsigned-apk-\${{ github.event.inputs.sellerId }}
          path: app/build/outputs/apk/release/*.apk
          retention-days: 1

      - name: Trigger Signer Repository (Repo B)
        uses: actions/github-script@v7
        with:
          github-token: \${{ secrets.PAT_TOKEN }}
          script: |
            github.rest.actions.createWorkflowDispatch({
              owner: context.repo.owner,
              repo: 'qianpulsa-apk-signer', # Nama Repo B Anda
              workflow_id: 'sign-apk.yml',
              ref: 'main',
              inputs: {
                source_repo: context.repo.owner + '/' + context.repo.repo,
                run_id: context.runId.toString(),
                seller_id: '\${{ github.event.inputs.sellerId }}',
                seller_name: '\${{ github.event.inputs.sellerName }}',
                existing_keystore: '\${{ github.event.inputs.existingKeystore }}'
              }
            })`;

  const repoBWorkflowCode = `name: Sign APK & Webhook

on:
  workflow_dispatch:
    inputs:
      source_repo:
        required: true
      run_id:
        required: true
      seller_id:
        required: true
      seller_name:
        required: true
      existing_keystore:
        required: false

jobs:
  sign_and_notify:
    runs-on: ubuntu-latest
    steps:
      - name: Download Unsigned APK dari Template Repo
        uses: dawidd6/action-download-artifact@v3
        with:
          github_token: \${{ secrets.PAT_TOKEN }}
          repo: \${{ github.event.inputs.source_repo }}
          run_id: \${{ github.event.inputs.run_id }}
          name: unsigned-apk-\${{ github.event.inputs.seller_id }}
          path: unsigned-app

      - name: Setup Android Build Tools
        run: |
          BUILD_TOOLS=$(ls -d $ANDROID_SDK_ROOT/build-tools/* | sort -V | tail -n 1)
          echo "BUILD_TOOLS=$BUILD_TOOLS" >> $GITHUB_ENV

      - name: Generate or Load Keystore
        id: keystore
        run: |
          if [ -n "\${{ github.event.inputs.existing_keystore }}" ]; then
            echo "Menggunakan existing keystore..."
            echo "\${{ github.event.inputs.existing_keystore }}" | base64 --decode > /tmp/keystore.jks
          else
            echo "Membuat keystore dinamis..."
            keytool -genkey -v \\
              -keystore /tmp/keystore.jks \\
              -alias "key0" \\
              -keyalg RSA -keysize 2048 -validity 10000 \\
              -dname "CN=\${{ github.event.inputs.seller_name }}, OU=QianPulsa Partner, O=QianPulsa, C=ID" \\
              -storepass "qianpulsapass" \\
              -keypass "qianpulsapass"
              
            BASE64_KS=$(base64 -w 0 /tmp/keystore.jks)
            echo "base64_ks=$BASE64_KS" >> $GITHUB_OUTPUT
          fi

      - name: Zipalign & Sign APK
        run: |
          APK_FILE=$(find unsigned-app -name "*.apk" | head -n 1)
          ALIGNED_APK="/tmp/aligned.apk"
          SIGNED_APK="signed-app-\${{ github.event.inputs.seller_id }}.apk"
          
          $BUILD_TOOLS/zipalign -v -p 4 "$APK_FILE" "$ALIGNED_APK"
          $BUILD_TOOLS/apksigner sign \\
            --ks /tmp/keystore.jks \\
            --ks-key-alias "key0" \\
            --ks-pass "pass:qianpulsapass" \\
            --key-pass "pass:qianpulsapass" \\
            --out "$SIGNED_APK" \\
            "$ALIGNED_APK"
            
          echo "SIGNED_APK_PATH=$SIGNED_APK" >> $GITHUB_ENV

      - name: Upload Signed APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: signed-apk-\${{ github.event.inputs.seller_id }}
          path: \${{ env.SIGNED_APK_PATH }}
          retention-days: 7

      - name: Kirim Webhook ke Dashboard QianPulsa
        run: |
          curl -X POST "https://api.qianpulsa.com/api/webhook/github-build" \\
          -H "Content-Type: application/json" \\
          -d '{
            "sellerId": "\${{ github.event.inputs.seller_id }}",
            "status": "COMPLETED",
            "signedArtifactName": "signed-apk-\${{ github.event.inputs.seller_id }}",
            "signerRunId": "\${{ github.run_id }}",
            "newKeystoreBase64": "\${{ steps.keystore.outputs.base64_ks }}"
          }'`;

  const backendWorkerCode = `import { Worker, Job } from 'bullmq';
import axios from 'axios';
import Redis from 'ioredis';

const redisConnection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

interface BuildApkPayload {
  sellerId: string;
  appName: string;
  existingKeystoreBase64?: string;
}

/**
 * Worker BullMQ: Memulai Alur Pembuatan APK.
 * Worker ini HANYA memicu Repo A (android-whitelabel-template).
 */
export const apkBuilderWorker = new Worker<BuildApkPayload>(
  'QianPulsa-APK-Build-Queue',
  async (job: Job) => {
    const { sellerId, appName, existingKeystoreBase64 } = job.data;

    try {
      console.log(\`[Worker] Memicu Repo A (Builder) untuk Seller: \${sellerId}\`);

      const GITHUB_TOKEN = process.env.GITHUB_PAT;
      const REPO_OWNER = process.env.GITHUB_ORG_NAME; // Cth: 'QianPulsa'
      const REPO_A_NAME = 'android-whitelabel-template';
      const WORKFLOW_ID = 'build.yml';

      await axios.post(
        \`https://api.github.com/repos/\${REPO_OWNER}/\${REPO_A_NAME}/actions/workflows/\${WORKFLOW_ID}/dispatches\`,
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

      console.log(\`[Worker] Berhasil memicu Repo A. Menunggu webhook dari Repo B (Signer)...\`);
    } catch (error: any) {
      console.error(\`[Worker] Gagal memicu Repo A:\`, error.response?.data || error.message);
      throw error;
    }
  },
  { connection: redisConnection }
);

// --- WEBHOOK RECEIVER (Express Route) ---
// Contoh endpoint: POST /api/webhook/github-build
/*
app.post('/api/webhook/github-build', async (req, res) => {
  const { sellerId, status, signedArtifactName, signerRunId, newKeystoreBase64 } = req.body;
  
  if (status === 'COMPLETED') {
    // 1. Update status APK seller di database (Prisma)
    // 2. Simpan newKeystoreBase64 ke database jika ada (untuk build berikutnya)
    // 3. Simpan signerRunId agar Dashboard bisa mendownload Artifact via GitHub API
    
    await prisma.sellerApp.update({
      where: { sellerId },
      data: {
        buildStatus: 'READY',
        keystoreBase64: newKeystoreBase64 || undefined,
        latestGithubRunId: signerRunId
      }
    });
  }
  
  res.sendStatus(200);
});
*/`;

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
              <p className="text-xs text-slate-500 font-medium">Arsitektur Pipeline APK (Multi-Repo)</p>
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
            Panduan Developer
          </button>
          <button
            onClick={() => setActiveTab('repoA')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'repoA' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Repo A (Builder)
          </button>
          <button
            onClick={() => setActiveTab('repoB')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'repoB' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            Repo B (Signer)
          </button>
          <button
            onClick={() => setActiveTab('backend')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'backend' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Server className="w-4 h-4" />
            Backend (BullMQ)
          </button>
        </div>

        {activeTab === 'guide' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Visual Flow Diagram */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between text-center overflow-x-auto">
                <div className="flex flex-col items-center min-w-[120px]">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                        <Server className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">Dashboard API</span>
                    <span className="text-[10px] text-slate-500">Node.js (BullMQ)</span>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 mx-2" />
                <div className="flex flex-col items-center min-w-[120px]">
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
                        <Smartphone className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">Repo A (Builder)</span>
                    <span className="text-[10px] text-slate-500">Build .apk</span>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 mx-2" />
                <div className="flex flex-col items-center min-w-[120px]">
                    <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mb-2">
                        <Layers className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">Repo B (Signer)</span>
                    <span className="text-[10px] text-slate-500">Sign & Generate Keystore</span>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 mx-2" />
                <div className="flex flex-col items-center min-w-[120px]">
                    <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mb-2">
                        <Webhook className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">Webhook</span>
                    <span className="text-[10px] text-slate-500">Kembali ke Dashboard</span>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Pemisahan Tugas (Separation of Concerns)</h2>
                <p className="text-sm text-slate-500 mt-1">Repo Template hanya bertugas membuild APK. Repo Signer khusus menangani sekuritas, keystore, dan webhook.</p>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Step 1 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
                    1
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Key className="w-4 h-4 text-slate-400" />
                      Siapkan Personal Access Token (PAT)
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Buat PAT di GitHub dengan izin <strong>repo</strong> dan <strong>workflow</strong>. Simpan token ini sebagai repository secret bernama <code>PAT_TOKEN</code> di <strong>KEDUA</strong> repository (Repo A dan Repo B), serta di <code>.env</code> Backend Node.js Anda.
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
                      <Smartphone className="w-4 h-4 text-slate-400" />
                      Konfigurasi Repo A (Template Android)
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Di repo <code>android-whitelabel-template</code>, salin kode dari tab <strong>Repo A (Builder)</strong> dan simpan sebagai <code>.github/workflows/build.yml</code>. Repo ini akan membuild APK mentah, menyimpannya sementara sebagai artifact, lalu men-trigger Repo B melalui API GitHub.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
                    3
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-slate-400" />
                      Konfigurasi Repo B (QianPulsa APK Signer)
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Buat repository baru bernama <code>qianpulsa-apk-signer</code>. Salin kode dari tab <strong>Repo B (Signer)</strong> dan simpan sebagai <code>.github/workflows/sign-apk.yml</code>. Repo ini akan secara otomatis menarik APK mentah dari Repo A, menandatanganinya, dan menembak Webhook ke server Anda.
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
                      Integrasi Backend Node.js
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Backend Anda cukup memicu <strong>Repo A</strong> (lihat tab Backend). Setelah seluruh pipeline selesai, Repo B akan menembak endpoint Webhook Anda. Gunakan <code>signerRunId</code> yang dikirimkan webhook untuk memberikan link download artifact kepada Seller melalui GitHub API (<code>GET /repos/owner/repo/actions/runs/:run_id/artifacts</code>).
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Tab Repo A */}
        {activeTab === 'repoA' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex items-start gap-4">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-blue-900">android-whitelabel-template / build.yml</h3>
                <p className="text-sm text-blue-800 mt-1">
                  Workflow ini fokus murni mem-build aplikasi. Setelah `.apk` (unsigned) jadi, ia akan di-upload ke artifact, lalu workflow ini akan memanggil API GitHub untuk menjalankan Repo B.
                </p>
              </div>
            </div>

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-mono text-slate-200">.github/workflows/build.yml</span>
                </div>
                <button
                  onClick={() => handleCopy(repoAWorkflowCode, 'repoA')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs font-medium"
                >
                  {copiedFile === 'repoA' ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Tersalin</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Salin Kode</>
                  )}
                </button>
              </div>
              <div className="p-4 overflow-x-auto bg-[#0d1117] max-h-[500px] overflow-y-auto">
                <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                  <code>{repoAWorkflowCode}</code>
                </pre>
              </div>
            </section>
          </div>
        )}

        {/* Tab Repo B */}
        {activeTab === 'repoB' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-5 flex items-start gap-4">
              <Info className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-purple-900">qianpulsa-apk-signer / sign-apk.yml</h3>
                <p className="text-sm text-purple-800 mt-1">
                  Menerima parameter dari Repo A, mendownload artifact unsigned dari Repo A menggunakan <code>dawidd6/action-download-artifact</code>, men-generate keystore (jika seller baru), lalu menandatangani dan mengirim Webhook ke backend Anda.
                </p>
              </div>
            </div>

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-mono text-slate-200">.github/workflows/sign-apk.yml</span>
                </div>
                <button
                  onClick={() => handleCopy(repoBWorkflowCode, 'repoB')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs font-medium"
                >
                  {copiedFile === 'repoB' ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Tersalin</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Salin Kode</>
                  )}
                </button>
              </div>
              <div className="p-4 overflow-x-auto bg-[#0d1117] max-h-[500px] overflow-y-auto">
                <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                  <code>{repoBWorkflowCode}</code>
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
                <h3 className="text-sm font-semibold text-emerald-900">Alur Eksekusi White-Label PPOB (Node.js)</h3>
                <p className="text-sm text-emerald-800 mt-1">
                  Backend hanya menembak API GitHub untuk memicu <strong>Repo A</strong>. Webhook kemudian dipasang untuk mendengarkan hasil akhir (Signed APK) yang dikirim oleh <strong>Repo B</strong>.
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
                  onClick={() => handleCopy(backendWorkerCode, 'node')}
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
                  <code>{backendWorkerCode}</code>
                </pre>
              </div>
            </section>
          </div>
        )}

      </main>
    </div>
  );
}
