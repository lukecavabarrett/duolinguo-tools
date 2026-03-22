import type { CourseConfig } from './types';

const DEFAULT_COURSE: CourseConfig = {
  courseId: 'en-ja',
  title: 'Japanese Flash',
  brandTitle: '日本語',
  brandSubtitle: 'Duolingo Flashcards',
  brandIcon: '🇯🇵',
  fromLang: 'en',
  toLang: 'ja',
  targetPack: 'ja',
  storagePrefix: 'jf',
  fetchPath: 'build/courses/en-ja/enriched/vocab_data.json',
  labels: {
    from: 'English',
    to: 'Japanese',
    fromShort: 'EN',
    toShort: 'JP',
  },
};

function readEmbeddedCourse(): CourseConfig | null {
  const el = document.getElementById('course-data');
  if (!el) return null;
  try {
    const parsed = JSON.parse(el.textContent || '{}');
    if (parsed && parsed.courseId && parsed.labels) return parsed;
  } catch (e) {}
  return null;
}

export const COURSE: CourseConfig = readEmbeddedCourse() || DEFAULT_COURSE;
