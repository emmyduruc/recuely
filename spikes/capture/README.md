# Capture lab (Task 9 spike, throwaway)

Measures, per device and browser: permission flow, echo tail (→ settle time), take-start clipping, recording
formats, joining takes, audio output routing, and background/lock behaviour. Results go to `results/` on this
Mac only when you tap **Send results**.

## Start the server (on the Mac)

```
cd spikes/capture && node server.mjs
```

- **This Mac (Chrome, Safari):** open **http://localhost:8080/**. No certificate is needed, because localhost counts as secure.
- **Phones:** open **https://192.168.2.122:8443/** once the CA is trusted (below). The Mac and the phones must be on the same Wi-Fi. If the IP has changed, the server prints the current one.

## Trust the local CA on the phones (one time)

The certificate is made just for this spike (`certs/`, gitignored, valid 30 days).

**iPhone**
1. In Safari, open `https://192.168.2.122:8443/ca.crt`. There will be a warning: tap **Show Details → visit this website**, then **Allow** the profile download.
2. Go to **Settings → General → VPN & Device Management**, tap the downloaded profile, and **Install**.
3. Go to **Settings → General → About → Certificate Trust Settings** and turn on **Recuely spike local CA (Task 9)**.

**Android (Chrome)**
1. Open `https://192.168.2.122:8443/ca.crt` in Chrome, tap past the warning (**Advanced → Proceed**), and download it.
2. Go to **Settings → Security (or Security & privacy) → More → Encryption & credentials → Install a certificate → CA certificate**, then pick the file.

**Remove it afterwards:** on iPhone, delete the profile in VPN & Device Management; on Android, go to Encryption & credentials → Trusted credentials → User and remove it.

## Run

On each device: type a device name (e.g. `iphone-safari`), run sections **B → H** in order, then tap **Send results to the Mac**. For **C** use the built-in speaker at your normal volume and stay quiet; for **D** say "Paper" at each green dot. In **E** and **F**, download a file or two and check they play in the system player (Photos, Files or QuickTime), and tell me which didn't.
