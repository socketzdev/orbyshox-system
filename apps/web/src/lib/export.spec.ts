import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadCSV } from './export';

describe('downloadCSV', () => {
  let createdBlob: Blob | null = null;
  let clickedElement: any = null;

  beforeEach(() => {
    createdBlob = null;
    clickedElement = null;

    global.URL.createObjectURL = vi.fn().mockImplementation((blob: Blob) => {
      createdBlob = blob;
      return 'blob:mock-url';
    });
    global.URL.revokeObjectURL = vi.fn();

    (globalThis as any).document = {
      createElement: vi.fn((tag: string) => {
        const el: any = {
          href: '',
          download: '',
          click: vi.fn(() => {
            clickedElement = el;
          }),
        };
        return el;
      }),
    };
  });

  it('should generate CSV with UTF-8 BOM and properly escape commas and quotes', async () => {
    const data = [
      { name: 'Restaurante "Sabor & Arte"', niche: 'Restaurante, Bar', price: 9900 },
      { name: 'Barbearia Simples', niche: 'Barbearia', price: 5000 },
    ];

    const columns = [
      { key: 'name', header: 'Nome da Empresa' },
      { key: 'niche', header: 'Nicho' },
      { key: 'price', header: 'Valor' },
    ];

    downloadCSV(data, columns, 'empresas_export');

    expect(clickedElement).not.toBeNull();
    expect(clickedElement.download).toMatch(/^empresas_export_\d{4}-\d{2}-\d{2}\.csv$/);

    // Verify blob content
    expect(createdBlob).not.toBeNull();

    // Verify byte-level UTF-8 BOM: 0xEF, 0xBB, 0xBF
    const buffer = new Uint8Array(await createdBlob!.arrayBuffer());
    expect(buffer[0]).toBe(0xef);
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);

    // Check CSV text content
    const text = await createdBlob!.text();
    expect(text).toContain('Nome da Empresa,Nicho,Valor');
    expect(text).toContain('"Restaurante ""Sabor & Arte"""');
    expect(text).toContain('"Restaurante, Bar"');
  });
});
