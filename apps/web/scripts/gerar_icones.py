"""Gera os ícones PWA do Radar BV (navy bg + 'R' em branco, estilo wordmark)."""
from PIL import Image, ImageDraw, ImageFont
import os

NAVY = (15, 23, 42)       # #0F172A
ESMERALDA = (5, 150, 105)  # #059669
BRANCO = (248, 250, 252)  # #F8FAFC

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

def tentar_fonte(tamanho):
    caminhos = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for c in caminhos:
        if os.path.exists(c):
            return ImageFont.truetype(c, tamanho)
    return ImageFont.load_default()

def gerar(tamanho, caminho, mascaravel=False):
    img = Image.new("RGBA", (tamanho, tamanho), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Para ícones "maskable", mantém a arte dentro da zona segura (~80% central)
    margem = int(tamanho * 0.1) if mascaravel else 0
    draw.rounded_rectangle(
        [margem, margem, tamanho - margem, tamanho - margem],
        radius=int(tamanho * 0.18),
        fill=NAVY,
    )

    # Barra de destaque (esmeralda) no rodapé do ícone, como um "scanner"/radar
    altura_barra = max(2, int(tamanho * 0.06))
    draw.rounded_rectangle(
        [margem + tamanho * 0.16, tamanho - margem - tamanho * 0.16 - altura_barra,
         tamanho - margem - tamanho * 0.16, tamanho - margem - tamanho * 0.16],
        radius=altura_barra // 2,
        fill=ESMERALDA,
    )

    # Letra "R" central em branco
    fonte = tentar_fonte(int(tamanho * 0.46))
    texto = "R"
    bbox = draw.textbbox((0, 0), texto, font=fonte)
    lw, lh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx, cy = tamanho / 2, tamanho / 2 - tamanho * 0.04
    draw.text((cx - lw / 2 - bbox[0], cy - lh / 2 - bbox[1]), texto, font=fonte, fill=BRANCO)

    img.save(caminho, "PNG")
    print(f"gerado: {caminho}")

gerar(192, os.path.join(OUT_DIR, "icon-192.png"))
gerar(512, os.path.join(OUT_DIR, "icon-512.png"))
gerar(512, os.path.join(OUT_DIR, "icon-512-maskable.png"), mascaravel=True)
gerar(180, os.path.join(OUT_DIR, "apple-touch-icon.png"))
