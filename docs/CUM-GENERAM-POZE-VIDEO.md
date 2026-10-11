# Cum generăm poze și video (rețetă dovedită, 09.10.2026)

> **Pentru orice agent care lucrează în acest proiect:** așa se generează imagini și video.
> Nu se inventează altă cale — rețeta de mai jos a fost probată cap-coadă, cu cifre măsurate.

## De ce așa

Calculatorul ownerului **nu are placă NVIDIA** (Intel UHD integrat, 2 GB VRAM) → generarea locală de
imagini/video este imposibilă. Soluția: închiriem un **GPU cu ora** pe Runpod, rulăm **ComfyUI**
(gratuit, open-source) acolo, iar noi vorbim cu el prin HTTP.

## Rețeta

1. **Pod Runpod**: template oficial **`runpod/comfyui:1.3.3-comfyuiv0.30.0-cuda13.0`**, GPU
   **RTX 4090 (24 GB)**, **On-Demand**, **Network volume 50 GB**, data center **EU-RO-1**.
   Cost: **0,89 $/oră** cât e pornit. Oprit → nu costă (doar volumul, ~cenți pe zi).
2. **Acces SSH fără intervenție în consolă** (opțional, dar util):
   `PATCH https://rest.runpod.io/v1/pods/<id>` cu `{"env":{"PUBLIC_KEY":"<cheia publică>"}}`.
   Atenție: PATCH-ul **repornește containerul** ⇒ se schimbă **portul SSH**
   (`portMappings` din `GET https://rest.runpod.io/v1/pods/<id>`; IP-ul mașinii rămâne același).
3. **Modelele** — se descarcă **cu `hf` (Xet)**, NU cu `wget`:
   `wget` a mers cu 2–5 MB/s (~30 min), `hf` a terminat 9 GB în ~35 s.
   ```bash
   export HF_XET_HIGH_PERFORMANCE=1
   M=/workspace/runpod-slim/ComfyUI/models

   # poze (7,1 GB, licență creativeml-openrail-m → uz comercial permis)
   hf download RunDiffusion/Juggernaut-XL-v9 \
     Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors --local-dir $M/checkpoints

   # video (Wan 2.1 = Apache-2.0 → uz comercial permis), în /tmp apoi mutate:
   hf download Comfy-Org/Wan_2.1_ComfyUI_repackaged \
     split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors \
     split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
     split_files/vae/wan_2.1_vae.safetensors --local-dir /tmp/wan
   mv /tmp/wan/split_files/diffusion_models/*.safetensors $M/diffusion_models/
   mv /tmp/wan/split_files/text_encoders/*.safetensors   $M/text_encoders/
   mv /tmp/wan/split_files/vae/*.safetensors             $M/vae/
   ```
   **Licențe:** NU folosi FLUX.1 **[dev]** (non-comercial) și nici **SVD** (Stable Video Diffusion,
   non-comercial). Wan 2.1 și SDXL-fine-tune-urile openrail sunt ok pentru produs cu abonamente.
4. **Interfața**: `https://<pod-id>-8188.proxy.runpod.net` (Runpod → Connect → Port 8188).

## Parametrii care au funcționat (măsurat)

**Poză** (SDXL, prin API, 12 secunde):

| Nod | Valori |
|---|---|
| CheckpointLoaderSimple | `Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors` |
| EmptyLatentImage | 1024×1024 |
| KSampler | 30 pași, cfg 6.5, `dpmpp_2m`, `karras`, seed fix |
| SaveImage | `filename_prefix: ortodoxia/test` |

**Video** (Wan 2.1 T2V 1.3B, prin API, **88 secunde** pentru 3,06 s de clip):

| Nod | Valori |
|---|---|
| UNETLoader | `wan2.1_t2v_1.3B_fp16.safetensors`, `default` |
| ModelSamplingSD3 | shift **8** |
| CLIPLoader | `umt5_xxl_fp8_e4m3fn_scaled.safetensors`, tip **wan** |
| VAELoader | `wan_2.1_vae.safetensors` |
| EmptyHunyuanLatentVideo | **480×832** (vertical), **49** cadre, batch 1 |
| KSampler | 30 pași, cfg 6, `uni_pc`, `simple`, seed fix |
| SaveWEBM | `codec: vp9`, fps **16**, crf 32, prefix `ortodoxia/video` |

**Cum se cheamă din cod** (fără interfață): `POST /prompt` cu graful în format API →
`GET /history/<prompt_id>` până apare fișierul → `GET /view?filename=…&subfolder=…&type=output`.

## În Jaguar (agentul ownerului)

- Modul: `src/runpod-gpu.ts` — `listRunpodPods`, `comfyUrlForPod`, `comfyHealth`, `runpodCostSoFar`,
  `describeRunpodGpu` (+ 13 teste în `tests/runpod-gpu.test.ts`, fără rețea).
- Capabilitate înregistrată: **`media.rented_gpu_comfyui`** (CAPS-001), cu poarta **`cost-decision`**:
  costă bani reali ⇒ **nimic nu pornește fără decizia ownerului**.
- Cheia Runpod stă în **seiful local** (`RUNPOD_API_KEY`). Niciodată în cod, Git, log sau chat.

## Reguli de bani (obligatorii)

1. Pornirea/oprirea podului și descărcarea modelelor = **decizia ownerului** (bani reali).
2. Costul se spune **înainte**: 0,89 $/oră; poză ≈ 0,003 $, clip de 3 s ≈ 0,022 $, clip de 5 s ≈ 0,07 $.
3. Când nu se lucrează: **Stop** la pod (nu Terminate, dacă vrei să păstrezi modelele).
4. Video = minute de GPU, deci costul crește proporțional cu durata clipului.

## Video următor (de făcut când ownerul cere)

- Rezoluție 720×1280 și clipuri de 5 secunde (81 cadre) — 3–5 minute per clip.
- **Image-to-video**: plecăm de la o icoană generată și o animăm (nod `WanImageToVideo`) — arată mai
  bine decât text-to-video pentru scene religioase.
