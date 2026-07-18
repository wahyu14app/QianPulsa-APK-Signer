# QianPulsa Android Signer

Custom GitHub Action (Composite) yang dirancang khusus untuk menandatangani rilis aplikasi Android (APK/AAB) untuk infrastruktur PPOB White-Label QianPulsa. Action ini beroperasi sepenuhnya mandiri (tanpa dependensi eksternal selain environment bawaan GitHub Actions).

**FITUR BARU**: Mendukung **Dynamic Keystore Generation**. Jika Anda tidak mengirimkan `signing_key` dari secret, action ini akan menggunakan Java `keytool` untuk membuat `.jks` unik secara instan berdasarkan data Seller (memungkinkan 1 Seller = 1 Keystore otomatis) dan mengembalikan format base64-nya ke output.

## Cara Menggunakan

1. **Export dari AI Studio**: Export (atau push) proyek ini ke GitHub organisasi Anda (contoh: `QianPulsa/android-signer`).
2. Gunakan di workflow utama platform PPOB Anda dengan merujuk ke repository hasil export tersebut.

## Contoh Penggunaan di Workflow Utama (.github/workflows/build.yml)

```yaml
name: Build and Sign Android APK

on:
  workflow_dispatch:
    inputs:
      sellerId:
        description: "ID unik seller"
        required: true
      sellerName:
        description: "Nama Toko / Seller"
        required: true
      # Base64 string jika seller sudah punya keystore di DB
      existingKeystore: 
        required: false

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
          # Kosongkan jika existingKeystore tidak ada, action akan menggenerate otomatis
          signing_key: ${{ github.event.inputs.existingKeystore }}
          seller_id: ${{ github.event.inputs.sellerId }}
          seller_name: ${{ github.event.inputs.sellerName }}
          alias: 'key0'
          key_store_password: 'qianpulsapass'
          key_password: 'qianpulsapass'

      - name: Send Webhook to Backend
        run: |
          curl -X POST "https://api.qianpulsa.com/webhook/github-build" \
          -H "Content-Type: application/json" \
          -d '{
            "sellerId": "${{ github.event.inputs.sellerId }}",
            "newKeystoreBase64": "${{ steps.sign_apk.outputs.generated_keystore_base64 }}"
          }'

      - name: Upload Signed APK
        uses: actions/upload-artifact@v3
        with:
          name: qianpulsa-release-signed
          path: ${{ steps.sign_apk.outputs.signed_release_file }}
```

