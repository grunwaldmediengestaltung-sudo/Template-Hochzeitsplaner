# Lokaler Testserver

Damit könnt ihr die App lokal testen, inklusive Speicherfunktion (Netlify Blobs)
und Bild-Upload, ohne jedes Mal auf Netlify deployen zu müssen.

## Einmalig einrichten

Im Projektordner:

```bash
npm install
npm install -D netlify-cli
```

## Server starten

```bash
npx netlify dev
```

Beim allerersten Start lädt die CLI einmalig die "Edge Functions"-Laufzeit aus dem
Internet herunter (auch wenn dieses Projekt keine Edge Functions nutzt, die CLI
bereitet das immer vor). Das dauert beim ersten Mal etwas, danach ist es gecacht.

Anschließend öffnet sich automatisch http://localhost:8888

- Die App läuft genau wie auf Netlify (gleiche index.html, app.js, style.css)
- Die Functions (data.mjs, upload.mjs, image.mjs) laufen lokal
- Gespeicherte Daten landen in einem lokalen Blob-Store (Ordner .netlify im
  Projektverzeichnis), bleiben also zwischen Neustarts erhalten

## Wichtig

- Beim ersten Start fragt die CLI eventuell, ob ihr euch mit einem Netlify-Account
  verbinden wollt. "No" / lokal weiterarbeiten ist völlig ausreichend zum Testen.
- Lokale Testdaten sind getrennt von den Produktionsdaten auf Netlify.
- Wenn ihr den lokalen Datenstand zurücksetzen wollt: einfach den Ordner
  .netlify löschen (wird beim nächsten Start neu angelegt), oder den
  Admin-Reset-Button (Passwort 4010) in der App nutzen.

## Falls "Download failed" o.ae. beim ersten Start

Das liegt meist an einer Firewall/Proxy, die den Download der Edge-Runtime blockiert.
Einfach npx netlify dev erneut ausfuehren, beim zweiten Versuch greift meist der
Cache, oder ein anderes Netzwerk (z.B. Hotspot) probieren.

## Beenden

Strg + C im Terminal.
