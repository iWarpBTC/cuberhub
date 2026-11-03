import { describe, expect, it } from 'vitest';
import { formatInspection, inspectionPenalty, inspectionStage } from './inspection';

describe('inspectionPenalty (WCA A4d)', () => {
  it('is clean up to and including 15 seconds', () => {
    expect(inspectionPenalty(0)).toBe('none');
    expect(inspectionPenalty(14999)).toBe('none');
    expect(inspectionPenalty(15000)).toBe('none');
  });
  it('is +2 after 15 up to and including 17 seconds', () => {
    expect(inspectionPenalty(15001)).toBe('plus2');
    expect(inspectionPenalty(17000)).toBe('plus2');
  });
  it('is DNF after 17 seconds', () => {
    expect(inspectionPenalty(17001)).toBe('dnf');
  });
});

describe('inspectionStage', () => {
  it('follows the 8 and 12 second calls and the penalty windows', () => {
    expect(inspectionStage(0)).toBe('early');
    expect(inspectionStage(7999)).toBe('early');
    expect(inspectionStage(8000)).toBe('eight');
    expect(inspectionStage(12000)).toBe('twelve');
    expect(inspectionStage(15500)).toBe('plus2');
    expect(inspectionStage(18000)).toBe('dnf');
  });
});

describe('formatInspection', () => {
  it('counts whole seconds down from 15', () => {
    expect(formatInspection(0)).toBe('15');
    expect(formatInspection(1)).toBe('15');
    expect(formatInspection(1000)).toBe('14');
    expect(formatInspection(14001)).toBe('1');
    expect(formatInspection(15000)).toBe('1');
  });
  it('shows the penalty once the time is up', () => {
    expect(formatInspection(15001)).toBe('+2');
    expect(formatInspection(17001)).toBe('DNF');
  });
});
