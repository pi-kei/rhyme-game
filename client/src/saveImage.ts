export default async function saveImage(poetry: any): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 2000;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error();
    }

    const computedStyle = window.getComputedStyle(document.querySelector('body')!);

    ctx.font = `14px ${computedStyle.fontFamily}`;

    ctx.fillStyle = computedStyle.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = computedStyle.color;

    const rectWidth = 710;
    const x = 20;
    let y = 10;
    for (let i = 0; i < poetry.length; ++i) {
        await drawImage(ctx, poetry[i].avatar, x, y, 28, 28);
        ctx.fillText(poetry[i].name+":", x + 30, y + 20);
        const height = drawLine(ctx, poetry[i].text, x + 20, y + 30, rectWidth - 20);
        y += height + 40;
    }

    ctx.fillText(window.location.hostname, canvas.width - ctx.measureText(window.location.hostname).width - 20, y + 2);

    y += 2 + 10;

    const canvas2 = document.createElement("canvas");
    canvas2.width = 750;
    canvas2.height = y;
    const ctx2 = canvas2.getContext("2d");

    if (!ctx2) {
        throw new Error();
    }

    ctx2.drawImage(canvas,0,0);

    return canvas2;
}

function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
    let words = text.split(" ");

    const startY = y;

    y += lineHeight;

    while (words.length > 0) {
        let line = '';
        let lineWidth = 0;
        for (let w = 0; w < words.length; ++w) {
            const metrics = context.measureText(line + (line.length ? " " : "") + words[w]);
            if (metrics.width > maxWidth) {
                if (w === 0) {
                    // word is too wide
                    line = words[0];
                    words = words.slice(w + 1);
                    context.fillText(line, x + maxWidth - metrics.width, y);
                } else {
                    words = words.slice(w);
                    context.fillText(line, x + maxWidth - lineWidth, y);
                }
                y += lineHeight;
                break;
            }
            line += (line.length ? " " : "") + words[w];
            lineWidth = metrics.width;
            if (w === words.length - 1) {
                words.length = 0;
                context.fillText(line, x + maxWidth - lineWidth, y);
            }
        }
    }

    return y - startY;
 }

 function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    context.beginPath();
    context.moveTo(x+r, y);
    context.arcTo(x+w, y,   x+w, y+h, r);
    context.arcTo(x+w, y+h, x,   y+h, r);
    context.arcTo(x,   y+h, x,   y,   r);
    context.arcTo(x,   y,   x+w, y,   r);
    context.closePath();
    context.lineWidth = 0.25;
    context.strokeStyle = "rgba(0,0,0,0.5)";
    context.shadowColor = "rgba(0,0,0,0.5)";
    context.shadowBlur = 2;
    context.shadowOffsetY = 1;
    context.stroke();
    context.shadowColor = "";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
  }

function drawLine(context: CanvasRenderingContext2D, text: string,  x: number, y: number, width: number): number {
    const height = wrapText(context, text, x + 10, y + 10, width - 20, 14);
    roundRect(context, x, y, width, height + 20, 2.5);
    return height + 20;
}

function drawImage(context: CanvasRenderingContext2D, src: string, x: number, y: number, w: number, h: number) {
    return new Promise((resolve, reject) => {
        if (!src) {
            resolve(undefined);
            return;
        }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            context.drawImage(img, x, y, w, h);
            resolve(undefined);
        };
        img.onerror = (error: Event | string) => {
            reject(error);
        };
        img.src = src;
    });
}