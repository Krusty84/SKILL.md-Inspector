import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { isProbablyNonEnglish } from '../src/quality/language';

describe('isProbablyNonEnglish', () => {
  it('does not flag English or short accented-Latin descriptions', () => {
    expect(isProbablyNonEnglish('Format inspection reports. Use when needed.')).toBe(false);
    // Four tokens is below the decidability floor, so this French fragment
    // deliberately stays unflagged (precision over recall).
    expect(isProbablyNonEnglish('Générer des rapports résumés')).toBe(false);
  });

  it('flags clearly Cyrillic and CJK descriptions', () => {
    expect(isProbablyNonEnglish('Форматировать отчёты для инспекции')).toBe(true);
    expect(isProbablyNonEnglish('レポートを生成する')).toBe(true);
  });

  it('does not flag text without letters', () => {
    expect(isProbablyNonEnglish('12345 --- ...')).toBe(false);
    expect(isProbablyNonEnglish('')).toBe(false);
  });

  it('flags Latin-script German, French, Spanish, Italian, and Portuguese descriptions', () => {
    expect(
      isProbablyNonEnglish(
        'Formatiert PDF-Rechnungen in das Standardlayout. Verwenden bei der Monatsabrechnung. Nicht verwenden für gescannte Bilder.',
      ),
    ).toBe(true);
    expect(
      isProbablyNonEnglish(
        'Extrait les tableaux des rapports PDF et les convertit en CSV. À utiliser pour les données tabulaires. Ne pas utiliser pour les documents scannés.',
      ),
    ).toBe(true);
    expect(
      isProbablyNonEnglish(
        'Genera informes PDF a partir de facturas de clientes. Usar cuando se procesan facturas. No usar para imágenes escaneadas.',
      ),
    ).toBe(true);
    expect(
      isProbablyNonEnglish(
        'Estrae le tabelle dai rapporti PDF e le converte in CSV. Usare quando servono dati tabellari. Non usare per i documenti scansionati.',
      ),
    ).toBe(true);
    expect(
      isProbablyNonEnglish(
        'Formata faturas PDF no layout padrão de contabilidade. Usar quando o usuário precisa de documentos financeiros. Não usar para imagens digitalizadas.',
      ),
    ).toBe(true);
  });

  it('keeps the Cyrillic control working', () => {
    expect(
      isProbablyNonEnglish('Форматирует PDF-счета в стандартный формат. Использовать при обработке счетов.'),
    ).toBe(true);
  });

  it('never flags varied English descriptions', () => {
    const englishControls = [
      'Format inspection reports using standard rules. Use when standardizing reports. Do not use when handling invoices.',
      'Convert `.dwg` files via ODA SDK. Use when reviewers request lightweight previews.',
      'Analyze CAN bus telemetry from vehicle ECUs and export CSV summaries for engineers.',
      'Extract tables from PDF reports (v2.1, rev. 3) — 100% offline, no network calls.',
      'Debug failing CI pipelines by reading the job logs.',
      'No PII. No secrets. Redact sensitive values before exporting logs.',
      'Convert a la carte menus to JSON. Use when digitizing restaurant menus.',
      'Convert EST timestamps to UTC. Use when normalizing server logs.',
      'See para 4 of the style guide. Use for legal notices. Do not use for ad copy.',
      'Da capo notation cleanup for MusicXML scores. Use when engraving parts.',
      'Generate release notes from merged pull requests and linked tickets.',
      'Use this skill whenever the user wants to create, read, edit, or manipulate Word documents.',
      // Cross-language homographs (plan 5 Part C): article/particle lookalikes
      // alone must never flag terse English as foreign.
      'Renders para-virtualized VM images. No console output. No GUI.',
      'Inspect die casting molds von Bosch. Compare die wear patterns across lots.',
      'Map Los Angeles transit data. No API key required. Se habla support available.',
    ];
    for (const control of englishControls) {
      expect(isProbablyNonEnglish(control), control).toBe(false);
    }
  });

  it('leaves Dutch unflagged (documented gap, no profile)', () => {
    // Dutch function words (de/het/een) are homograph-heavy; a Dutch profile
    // needs its own precision work and is deliberately out of scope (plan 5).
    expect(
      isProbablyNonEnglish(
        'Formatteert PDF-facturen naar de standaardindeling. Gebruiken bij de maandelijkse afsluiting. Niet gebruiken voor gescande afbeeldingen.',
      ),
    ).toBe(false);
  });

  it('never flags any English benchmark description (bulk zero-false-positive gate)', () => {
    const cases: Array<{ id: string; language: string; description: string }> = JSON.parse(
      readFileSync('benchmarks/static-description-quality/cases.json', 'utf8'),
    );
    for (const item of cases) {
      if (item.language === 'en') {
        expect(isProbablyNonEnglish(item.description), item.id).toBe(false);
      }
    }
  });
});
