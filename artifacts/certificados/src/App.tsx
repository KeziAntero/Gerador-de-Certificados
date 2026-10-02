import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import bkgUrl from "@assets/background-gcd_1779925429030.png";
import logosUrl from "@assets/logos_1779925451607.png";

type Row = Record<string, string>;

type Signature = {
  id: string;
  name: string;
  role: string;
};

type LogoItem = {
  id: string;
  url: string;
};

const BKG_URL = bkgUrl;
const LOGOS_URL = logosUrl;
const DEFAULT_LOGOS: LogoItem[] = [{ id: "default", url: LOGOS_URL }];

const DEFAULT_SIGNATURES: Signature[] = [
  { id: "1", name: "Clara Sacco", role: "Diretora do data_labe" },
];

function createSignatureId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

function signaturesCountClass(count: number): string {
  if (count <= 1) return "cert-signatures--count-1";
  if (count === 2) return "cert-signatures--count-2";
  if (count === 3) return "cert-signatures--count-3";
  if (count === 4) return "cert-signatures--count-4";
  return "cert-signatures--count-many";
}

function logosCountClass(count: number): string {
  if (count <= 1) return "cert-logos-row--count-1";
  if (count === 2) return "cert-logos-row--count-2";
  if (count === 3) return "cert-logos-row--count-3";
  if (count === 4) return "cert-logos-row--count-4";
  return "cert-logos-row--count-many";
}

const DEFAULT_TEMPLATE =
  'Certificamos que {{nome}} concluiu a formação "Uso do Kobotoolbox para Coleta de Dados" da Rede Geração Cidadã de Dados, com carga horária de 4 horas em 2 encontros, ministrada pelo Instituto Decodifica, abordando o uso do Kobotoolbox para criação de formulários offline e boas práticas na elaboração de questionários.';

function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

type PdfLogoLayer = {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type CertificateCanvas = {
  canvas: HTMLCanvasElement;
  logoLayers: PdfLogoLayer[];
};

async function renderCertificateCanvas(
  element: HTMLDivElement,
  scale: number,
  backgroundColor: string | null,
): Promise<CertificateCanvas> {
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor,
    logging: false,
    imageTimeout: 15000,
    onclone: (clonedDocument) => {
      clonedDocument
        .querySelectorAll<HTMLImageElement>(".cert-logo-image")
        .forEach((logo) => {
          logo.style.visibility = "hidden";
        });
    },
  });
  const certificateBounds = element.getBoundingClientRect();
  const pixelScale = canvas.width / certificateBounds.width;
  const logoLayers = await Promise.all(
    Array.from(element.querySelectorAll<HTMLImageElement>(".cert-logo-image")).map(
      async (logo) => {
        const frame = logo.parentElement;
        if (!frame) {
          throw new Error("Não foi possível localizar o espaço reservado da logo.");
        }
        if (!logo.complete || logo.naturalWidth === 0 || logo.naturalHeight === 0) {
          throw new Error("Não foi possível carregar uma das logos do certificado.");
        }

        const frameBounds = frame.getBoundingClientRect();
        const ratio = Math.min(
          frameBounds.width / logo.naturalWidth,
          frameBounds.height / logo.naturalHeight,
          1,
        );
        const width = logo.naturalWidth * ratio;
        const height = logo.naturalHeight * ratio;
        const x =
          (frameBounds.left -
            certificateBounds.left +
            (frameBounds.width - width) / 2) *
          pixelScale;
        const y =
          (frameBounds.top -
            certificateBounds.top +
            (frameBounds.height - height) / 2) *
          pixelScale;
        const imageCanvas = document.createElement("canvas");
        imageCanvas.width = logo.naturalWidth;
        imageCanvas.height = logo.naturalHeight;
        const imageContext = imageCanvas.getContext("2d");
        if (!imageContext) {
          throw new Error("Não foi possível preparar a logo para o PDF.");
        }
        imageContext.drawImage(logo, 0, 0);

        return {
          dataUrl: imageCanvas.toDataURL("image/png"),
          x,
          y,
          width: width * pixelScale,
          height: height * pixelScale,
        };
      },
    ),
  );

  return { canvas, logoLayers };
}

function addLogoLayers(pdf: jsPDF, logoLayers: PdfLogoLayer[]) {
  logoLayers.forEach(({ dataUrl, x, y, width, height }) => {
    pdf.addImage(dataUrl, "PNG", x, y, width, height, undefined, "FAST");
  });
}

function lookup(row: Row, key: string): string {
  const k = key.toLowerCase();
  for (const rk of Object.keys(row)) {
    if (rk.toLowerCase() === k) return row[rk] ?? "";
  }
  return "";
}

function renderTemplateJSX(tpl: string, row: Row, boldKeys: string[]): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\{\{\s*([\w\-]+)\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(tpl)) !== null) {
    if (m.index > last) parts.push(tpl.slice(last, m.index));
    const key = m[1];
    const value = lookup(row, key);
    const isBold = boldKeys.some((b) => b.toLowerCase() === key.toLowerCase());
    parts.push(isBold ? <strong key={i++}>{value}</strong> : <span key={i++}>{value}</span>);
    last = m.index + m[0].length;
  }
  if (last < tpl.length) parts.push(tpl.slice(last));
  return parts;
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "certificado";
}

function Certificate({
  content,
  signatures,
  logos,
  backgroundUrl,
  innerRef,
}: {
  content: React.ReactNode;
  signatures: Signature[];
  logos: LogoItem[];
  backgroundUrl: string;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const visibleSignatures = signatures.filter(
    (s) => s.name.trim() !== "" || s.role.trim() !== "",
  );

  return (
    <div
      className="cert"
      ref={innerRef}
      style={{ backgroundImage: `url(${backgroundUrl})` }}
    >
      <div className="cert-body">{content}</div>
      {visibleSignatures.length > 0 && (
        <div className={`cert-signatures ${signaturesCountClass(visibleSignatures.length)}`}>
          {visibleSignatures.map((sig) => (
            <div key={sig.id} className="cert-signature-item">
              {sig.name.trim() !== "" && (
                <div className="cert-signature-name">{sig.name}</div>
              )}
              {sig.role.trim() !== "" && (
                <div className="cert-signature-role">{sig.role}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {logos.length > 0 && (
        <div className={`cert-logos-row ${logosCountClass(logos.length)}`}>
          {logos.map((logo) => (
            <div key={logo.id} className="cert-logo-item">
              <img className="cert-logo-image" src={logo.url} alt="" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [signatures, setSignatures] = useState<Signature[]>(DEFAULT_SIGNATURES);
  const [backgroundUrl, setBackgroundUrl] = useState<string>(BKG_URL);
  const [logos, setLogos] = useState<LogoItem[]>(DEFAULT_LOGOS);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [filenameField, setFilenameField] = useState<string>("");
  const [busy, setBusy] = useState<{ active: boolean; current: number; total: number; label: string }>({
    active: false,
    current: 0,
    total: 0,
    label: "",
  });
  const [imagesReady, setImagesReady] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);

  const renderRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const backgroundBlobRef = useRef<string | null>(null);
  const logoBlobRefs = useRef<Map<string, string>>(new Map());

  const logoUrlsKey = useMemo(() => logos.map((l) => l.url).join("|"), [logos]);

  useEffect(() => {
    return () => {
      if (backgroundBlobRef.current) {
        URL.revokeObjectURL(backgroundBlobRef.current);
      }
      logoBlobRefs.current.forEach((url) => URL.revokeObjectURL(url));
      logoBlobRefs.current.clear();
    };
  }, []);

  useEffect(() => {
    setImagesReady(false);
    const fontsReady =
      typeof document !== "undefined" && "fonts" in document
        ? document.fonts.ready
        : Promise.resolve();
    Promise.all([
      preloadImage(backgroundUrl),
      ...logos.map((logo) => preloadImage(logo.url)),
      fontsReady,
    ])
      .then(() => setImagesReady(true))
      .catch(() => setImagesReady(true));
  }, [backgroundUrl, logoUrlsKey]);

  useEffect(() => {
    const container = previewViewportRef.current;
    if (!container) return;

    const updateScale = () => {
      const availableWidth = container.clientWidth - 16;
      const nextScale = Math.min(1, availableWidth / 1024);
      setPreviewScale(nextScale > 0 ? nextScale : 1);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const handleCsv = useCallback((file: File) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const data = (res.data as Row[]).filter((r) =>
          Object.values(r).some((v) => String(v ?? "").trim() !== ""),
        );
        const hdrs = (res.meta.fields ?? []).map((h) => h.trim());
        setHeaders(hdrs);
        setRows(data);
        setPreviewIndex(0);
        const nameLike = hdrs.find((h) => /nome|name/i.test(h)) ?? hdrs[0] ?? "";
        setFilenameField(nameLike);
      },
    });
  }, []);

  const previewRow: Row | null = rows[previewIndex] ?? null;
  const boldKeys = useMemo(() => {
    const candidates = headers.filter((h) => /nome|name/i.test(h));
    return candidates.length > 0 ? candidates : ["nome", "name"];
  }, [headers]);
  const previewContent = useMemo(() => {
    const row: Row = previewRow ?? {
      nome: "[Nome do Participante]",
    };
    return renderTemplateJSX(template, row, boldKeys);
  }, [template, previewRow, boldKeys]);

  const generatePdf = useCallback(async (row: Row, name: string): Promise<jsPDF> => {
    const el = renderRef.current!;
    const { canvas, logoLayers } = await renderCertificateCanvas(el, 3, null);
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [canvas.width, canvas.height],
      compress: true,
      hotfixes: ["px_scaling"],
    });
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      0,
      0,
      canvas.width,
      canvas.height,
      undefined,
      "FAST",
    );
    addLogoLayers(pdf, logoLayers);
    void name;
    void row;
    return pdf;
  }, []);

  const downloadSinglePdf = useCallback(
    async (index: number) => {
      const row = rows[index];
      if (!row) return;
      setBusy({ active: true, current: 1, total: 1, label: "Gerando PDF…" });
      await new Promise((r) => setTimeout(r, 50));
      try {
        const pdf = await generatePdf(row, "");
        const name = filenameField ? row[filenameField] ?? "" : `certificado_${index + 1}`;
        pdf.save(`${slugify(name)}.pdf`);
      } finally {
        setBusy({ active: false, current: 0, total: 0, label: "" });
      }
    },
    [rows, filenameField, generatePdf],
  );

  const downloadAllZipless = useCallback(async () => {
    if (rows.length === 0) return;
    setBusy({ active: true, current: 0, total: rows.length, label: "Gerando certificados…" });
    const originalIndex = previewIndex;
    try {
      for (let i = 0; i < rows.length; i++) {
        setPreviewIndex(i);
        setBusy({ active: true, current: i + 1, total: rows.length, label: "Gerando certificados…" });
        // Wait for React to render the new text
        await new Promise((r) => setTimeout(r, 80));
        const row = rows[i];
        const pdf = await generatePdf(row, "");
        const name = filenameField ? row[filenameField] ?? "" : `certificado_${i + 1}`;
        pdf.save(`${slugify(name)}.pdf`);
      }
    } finally {
      setPreviewIndex(originalIndex);
      setBusy({ active: false, current: 0, total: 0, label: "" });
    }
  }, [rows, previewIndex, filenameField, generatePdf]);

  const downloadAllMergedPdf = useCallback(async () => {
    if (rows.length === 0) return;
    setBusy({ active: true, current: 0, total: rows.length, label: "Gerando PDF combinado…" });
    const originalIndex = previewIndex;
    let merged: jsPDF | null = null;
    try {
      for (let i = 0; i < rows.length; i++) {
        setPreviewIndex(i);
        setBusy({ active: true, current: i + 1, total: rows.length, label: "Gerando PDF combinado…" });
        await new Promise((r) => setTimeout(r, 80));
        const el = renderRef.current!;
        const { canvas, logoLayers } = await renderCertificateCanvas(el, 2, "#ffffff");
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        if (!merged) {
          merged = new jsPDF({
            orientation: "landscape",
            unit: "px",
            format: [canvas.width, canvas.height],
            compress: true,
            hotfixes: ["px_scaling"],
          });
        } else {
          merged.addPage([canvas.width, canvas.height], "landscape");
        }
        merged.addImage(dataUrl, "JPEG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
        addLogoLayers(merged, logoLayers);
        // Free canvas memory between iterations
        canvas.width = 0;
        canvas.height = 0;
      }
      merged?.save("certificados.pdf");
    } finally {
      setPreviewIndex(originalIndex);
      setBusy({ active: false, current: 0, total: 0, label: "" });
    }
  }, [rows, previewIndex]);

  const updateSignature = useCallback((id: string, field: "name" | "role", value: string) => {
    setSignatures((prev) =>
      prev.map((sig) => (sig.id === id ? { ...sig, [field]: value } : sig)),
    );
  }, []);

  const addSignature = useCallback(() => {
    setSignatures((prev) => [
      ...prev,
      { id: createSignatureId(), name: "", role: "" },
    ]);
  }, []);

  const removeSignature = useCallback((id: string) => {
    setSignatures((prev) => (prev.length <= 1 ? prev : prev.filter((sig) => sig.id !== id)));
  }, []);

  const handleBackground = useCallback((file: File) => {
    if (backgroundBlobRef.current) {
      URL.revokeObjectURL(backgroundBlobRef.current);
    }
    const url = URL.createObjectURL(file);
    backgroundBlobRef.current = url;
    setBackgroundUrl(url);
  }, []);

  const resetBackground = useCallback(() => {
    if (backgroundBlobRef.current) {
      URL.revokeObjectURL(backgroundBlobRef.current);
      backgroundBlobRef.current = null;
    }
    setBackgroundUrl(BKG_URL);
  }, []);

  const handleLogos = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: LogoItem[] = Array.from(files).map((file) => {
      const id = createSignatureId();
      const url = URL.createObjectURL(file);
      logoBlobRefs.current.set(id, url);
      return { id, url };
    });
    setLogos((prev) => [...prev, ...added]);
  }, []);

  const removeLogo = useCallback((id: string) => {
    setLogos((prev) => {
      const blob = logoBlobRefs.current.get(id);
      if (blob) {
        URL.revokeObjectURL(blob);
        logoBlobRefs.current.delete(id);
      }
      return prev.filter((logo) => logo.id !== id);
    });
  }, []);

  const resetLogos = useCallback(() => {
    logoBlobRefs.current.forEach((url) => URL.revokeObjectURL(url));
    logoBlobRefs.current.clear();
    setLogos(DEFAULT_LOGOS);
  }, []);

  const downloadSampleCsv = useCallback(() => {
    const csv = "nome\nMaria Silva\nJoão Souza\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "exemplo_participantes.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/favicon.png"
              alt="Geração Cidadã de Dados"
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Gerador de Certificados em Lote</h1>
              <p className="text-sm text-gray-600">
                Envie um CSV com os participantes e gere os PDFs.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-8">
        <aside className="space-y-6 min-w-0">
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">1. Planilha CSV</h2>
              <p className="text-xs text-gray-500 mt-1">
                Cabeçalho na primeira linha. Use os nomes das colunas como variáveis no texto, ex.{" "}
                <code className="bg-gray-100 px-1 rounded">{`{{nome}}`}</code>.
              </p>
            </div>
            <label className="block">
              <span className="sr-only">Arquivo CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsv(f);
                }}
                className="block w-full text-sm text-gray-700
                  file:mr-3 file:py-2 file:px-3
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-gray-900 file:text-white
                  hover:file:bg-gray-700 cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={downloadSampleCsv}
              className="text-xs text-blue-700 hover:underline"
            >
              Baixar CSV de exemplo
            </button>

            {rows.length > 0 && (
              <div className="text-sm text-gray-700 bg-gray-50 rounded-md p-3 border border-gray-200">
                <div>
                  <strong>{rows.length}</strong> participante{rows.length === 1 ? "" : "s"} carregado
                  {rows.length === 1 ? "" : "s"}.
                </div>
                <div className="mt-1 text-xs text-gray-500 break-words">
                  Colunas: {headers.join(", ")}
                </div>
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">2. Fundo do certificado</h2>
              <p className="text-xs text-gray-500 mt-1">
                Envie uma imagem de fundo (PNG ou JPG). Tamanho recomendado: 1024 × 600 px.
              </p>
            </div>
            <label className="block">
              <span className="sr-only">Imagem de fundo</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBackground(f);
                  e.target.value = "";
                }}
                className="block w-full text-sm text-gray-700
                  file:mr-3 file:py-2 file:px-3
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-gray-900 file:text-white
                  hover:file:bg-gray-700 cursor-pointer"
              />
            </label>
            {backgroundUrl !== BKG_URL && (
              <button
                type="button"
                onClick={resetBackground}
                className="text-xs text-blue-700 hover:underline"
              >
                Restaurar fundo padrão
              </button>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">3. Logos</h2>
              <p className="text-xs text-gray-500 mt-1">
                Envie uma ou mais imagens de logo (PNG, JPG ou WebP). Elas aparecem no rodapé do
                certificado.
              </p>
            </div>
            <label className="block">
              <span className="sr-only">Imagens de logo</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => {
                  handleLogos(e.target.files);
                  e.target.value = "";
                }}
                className="block w-full text-sm text-gray-700
                  file:mr-3 file:py-2 file:px-3
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-gray-900 file:text-white
                  hover:file:bg-gray-700 cursor-pointer"
              />
            </label>
            {logos.length > 0 && (
              <div className="space-y-2">
                {logos.map((logo, index) => (
                  <div
                    key={logo.id}
                    className="flex items-center gap-3 rounded-md border border-gray-200 p-2 bg-gray-50"
                  >
                    <img
                      src={logo.url}
                      alt=""
                      className="h-8 max-w-[120px] object-contain bg-white rounded"
                    />
                    <span className="text-xs text-gray-600 flex-1">Logo {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeLogo(logo.id)}
                      className="text-xs text-red-600 hover:text-red-800 hover:underline shrink-0"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!(logos.length === 1 && logos[0]?.id === "default") && (
              <button
                type="button"
                onClick={resetLogos}
                className="text-xs text-blue-700 hover:underline"
              >
                Restaurar logos padrão
              </button>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900">4. Texto do certificado</h2>
              <p className="text-xs text-gray-500 mt-1">
                Use <code className="bg-gray-100 px-1 rounded">{`{{coluna}}`}</code> para substituir
                pelos valores da planilha.
              </p>
            </div>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={10}
              className="w-full text-sm border border-gray-300 rounded-md p-3 font-mono leading-relaxed
                focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
            />
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">5. Assinaturas</h2>
              <p className="text-xs text-gray-500 mt-1">
                Nome em negrito e cargo/organização abaixo. Adicione quantas assinaturas precisar.
              </p>
            </div>
            <div className="space-y-3">
              {signatures.map((sig, index) => (
                <div
                  key={sig.id}
                  className="rounded-md border border-gray-200 p-3 space-y-2 bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-600">
                      Assinatura {index + 1}
                    </span>
                    {signatures.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSignature(sig.id)}
                        className="text-xs text-red-600 hover:text-red-800 hover:underline"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  <label className="block text-sm">
                    <span className="text-gray-700">Nome da pessoa</span>
                    <input
                      type="text"
                      value={sig.name}
                      onChange={(e) => updateSignature(sig.id, "name", e.target.value)}
                      placeholder="Ex.: Clara Sacco"
                      className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm bg-white
                        focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-gray-700">Cargo e organização</span>
                    <input
                      type="text"
                      value={sig.role}
                      onChange={(e) => updateSignature(sig.id, "role", e.target.value)}
                      placeholder="Ex.: Diretora do data_labe"
                      className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm bg-white
                        focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                    />
                  </label>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSignature}
              className="w-full px-4 py-2 rounded-md border border-dashed border-gray-400 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Adicionar assinatura
            </button>
          </section>

          {rows.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900">6. Pré-visualização</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                  disabled={previewIndex === 0}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600 flex-1 text-center">
                  {previewIndex + 1} / {rows.length}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewIndex((i) => Math.min(rows.length - 1, i + 1))}
                  disabled={previewIndex >= rows.length - 1}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                >
                  Próximo
                </button>
              </div>

              <label className="block text-sm">
                <span className="text-gray-700">Nome do arquivo a partir da coluna:</span>
                <select
                  value={filenameField}
                  onChange={(e) => setFilenameField(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm bg-white"
                >
                  <option value="">(numeração sequencial)</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">7. Gerar PDFs</h2>
            <button
              type="button"
              onClick={() => downloadSinglePdf(previewIndex)}
              disabled={!imagesReady || rows.length === 0 || busy.active}
              className="w-full px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
            >
              Baixar o atual
            </button>
            <button
              type="button"
              onClick={downloadAllZipless}
              disabled={!imagesReady || rows.length === 0 || busy.active}
              className="w-full px-4 py-2 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-40"
            >
              Baixar todos (1 PDF por pessoa)
            </button>
            <button
              type="button"
              onClick={downloadAllMergedPdf}
              disabled={!imagesReady || rows.length === 0 || busy.active}
              className="w-full px-4 py-2 rounded-md border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
            >
              Baixar todos em um único PDF
            </button>

            {busy.active && (
              <div className="text-xs text-gray-600">
                {busy.label} ({busy.current}/{busy.total})
                <div className="h-1.5 bg-gray-200 rounded mt-1 overflow-hidden">
                  <div
                    className="h-full bg-gray-900 transition-all"
                    style={{ width: `${busy.total ? (busy.current / busy.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
            {!imagesReady && (
              <p className="text-xs text-gray-500">Carregando imagens do template…</p>
            )}
          </section>
        </aside>

        <section className="min-w-0">
          <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-hidden min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Pré-visualização do certificado</h2>
              <span className="text-xs text-gray-500">1024 × 600 px</span>
            </div>
            <div
              ref={previewViewportRef}
              style={{
                width: "100%",
                overflow: "hidden",
                background: "#eaeaea",
                borderRadius: 8,
                padding: 8,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 1024,
                  height: 600 * previewScale,
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top center",
                }}
              >
                <Certificate
                  content={previewContent}
                  signatures={signatures}
                  logos={logos}
                  backgroundUrl={backgroundUrl}
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="app-credits">
        <img src="/ka-credits.png" alt="" aria-hidden="true" />
      </footer>

      <div
        aria-hidden
        style={{
          position: "fixed",
          left: -99999,
          top: -99999,
          pointerEvents: "none",
          opacity: 0,
        }}
      >
        <Certificate
          content={previewContent}
          signatures={signatures}
          logos={logos}
          backgroundUrl={backgroundUrl}
          innerRef={renderRef}
        />
      </div>
    </div>
  );
}
