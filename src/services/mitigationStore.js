import { useState, useEffect } from 'react';

const KEY = 'ai_doctor_mitigations_v1';
const EVENT = 'ai_doctor_mitigations_updated';

export function getCompletedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function setCompletedIds(ids) {
  localStorage.setItem(KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new Event(EVENT));
}

export function toggleCompleted(id) {
  const current = getCompletedIds();
  current.has(id) ? current.delete(id) : current.add(id);
  setCompletedIds(current);
}

export function clearAll() {
  setCompletedIds(new Set());
}

export function useCompletedIds() {
  const [ids, setIds] = useState(() => getCompletedIds());
  useEffect(() => {
    const handler = () => setIds(getCompletedIds());
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return ids;
}

export function getMitigatedCVEs(completedIds, steps) {
  const mitigated = new Set();
  steps.forEach((s) => {
    if (completedIds.has(s.id) && s.cve) {
      mitigated.add(s.cve);
    }
  });
  return mitigated;
}
