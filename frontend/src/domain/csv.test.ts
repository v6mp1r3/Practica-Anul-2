import { describe, expect, it } from 'vitest';
import { parseStudyPlan, splitCsvLine, STUDY_PLAN_TEMPLATE } from './csv';

describe('splitCsvLine', () => {
  it('handles quoted fields with delimiters inside', () => {
    expect(splitCsvLine('A,"Hello, world",3', ',')).toEqual(['A', 'Hello, world', '3']);
    expect(splitCsvLine('"Say ""hi"""', ',')).toEqual(['Say "hi"']);
  });
});

describe('parseStudyPlan', () => {
  it('parses the template and skips the header', () => {
    const r = parseStudyPlan(STUDY_PLAN_TEMPLATE);
    expect(r.errors).toEqual([]);
    expect(r.subjects).toHaveLength(2);
    expect(r.subjects[0]).toEqual({ code: 'AM', name: 'Analiză matematică', credits: 6, year: 1, lecturePairs: 2, seminarPairs: 1, labPairs: 0 });
  });

  it('accepts semicolons and decimal commas', () => {
    const r = parseStudyPlan('ac;Arhitectura calculatoarelor;4;1;0,5;0;0,5');
    expect(r.subjects[0]).toMatchObject({ code: 'AC', lecturePairs: 0.5, labPairs: 0.5 });
  });

  it('reports bad lines with their line number', () => {
    const r = parseStudyPlan('code,name,credits\nX,,3\nY,Name,abc');
    expect(r.subjects).toEqual([]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
  });
});
