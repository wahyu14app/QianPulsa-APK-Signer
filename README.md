# QianPulsa PPOB Android White-Label Builder

Repositori ini adalah sistem utama untuk otomatisasi build dan signing aplikasi Android PPOB White-Label bagi Mitra/Seller QianPulsa.

## Arsitektur: Single-Repo Data-Driven

Sistem ini menggunakan arsitektur **Single-Repo Data-Driven**, di mana satu repository menyimpan berbagai pilihan template aplikasi (misalnya `template-1`, `template-2`, dll) dan konfigurasi diinjeksi secara dinamis pada saat build (Data-Driven).

1. **GitHub Actions (`.github/workflows/build-and-sign.yml`)**: Mengelola alur kerja CI/CD untuk kompilasi dan signing.
2. **Node.js Builder Script (`scripts/builder.js`)**: Bertugas mengambil data konfigurasi (Nama Aplikasi, Warna Tema, Package Name, dan Keystore) dari Backend QianPulsa, lalu memodifikasi *source code* template.
3. **Template Aplikasi (`apps/`)**: Folder yang menampung *source code* Android asli untuk setiap tema yang tersedia.

## Alur Kerja (Workflow)
1. **Trigger dari Backend**: Ketika Seller menekan tombol "Build" di Dashboard, Backend akan menembak GitHub REST API untuk memicu Workflow dengan mengirim `sellerId` dan `templateId`.
2. **Fetch Config & Modify (Data-Driven)**: Script `builder.js` akan mengambil data visual dan branding dari Backend, lalu memodifikasi `build.gradle`, `strings.xml`, dan `colors.xml` di dalam folder template yang dipilih.
3. **Build APK**: Gradle akan mengompilasi *source code* menjadi *release APK*.
4. **Sign APK**: `apksigner` menandatangani APK menggunakan *keystore* Seller. Jika Seller baru pertama kali membuild, script akan men-generate *keystore* baru untuk mereka.
5. **Webhook Callback**: GitHub Actions mengirimkan notifikasi Webhook kembali ke Backend QianPulsa (status sukses, link download Artifact, dan *keystore* baru jika ada).
