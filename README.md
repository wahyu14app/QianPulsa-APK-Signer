# QianPulsa Android Signer

Custom GitHub Action (Composite) yang dirancang khusus untuk menandatangani rilis aplikasi Android (APK/AAB) untuk infrastruktur PPOB White-Label QianPulsa. Action ini beroperasi sepenuhnya mandiri (tanpa dependensi eksternal selain environment bawaan GitHub Actions).

## Cara Menggunakan

1. **Export dari AI Studio**: Export (atau push) proyek ini ke GitHub organisasi Anda (contoh: `QianPulsa/android-signer`).
2. Gunakan di workflow utama platform PPOB Anda dengan merujuk ke repository hasil export tersebut.

## Contoh Penggunaan di Workflow Utama (.github/workflows/build.yml)

```yaml
name: Build and Sign Android APK

on:
  push:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Build Release APK
        run: ./gradlew assembleRelease

      # Menggunakan Custom Action Anda
      - name: Sign APK Mandiri
        uses: {GITHUB_USERNAME}/{NAMA_REPO_ANDA}@main
        id: sign_apk
        with:
          release_dir: app/build/outputs/apk/release
          signing_key: ${{ secrets.KEYSTORE_BASE64 }}
          alias: ${{ secrets.KEY_ALIAS }}
          key_store_password: ${{ secrets.KEYSTORE_PASSWORD }}
          key_password: ${{ secrets.KEY_PASSWORD }}

      - name: Upload Signed APK
        uses: actions/upload-artifact@v3
        with:
          name: qianpulsa-release-signed
          path: ${{ steps.sign_apk.outputs.signed_release_file }}
```

## Persyaratan (Secrets)
Sebelum menjalankan workflow yang memanggil action ini, pastikan Anda menyimpan rahasia berikut di pengaturan repositori:
*   `KEYSTORE_BASE64`: Keystore yang diconvert ke format base64. (Gunakan perintah `openssl base64 -in release.keystore -out keystore.txt` pada terminal lokal Anda)
*   `KEY_ALIAS`: Alias key.
*   `KEYSTORE_PASSWORD`: Password untuk file keystore.
*   `KEY_PASSWORD`: Password untuk alias key.
