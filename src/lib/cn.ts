/**
 * Joins class names, dropping anything falsy — a thin name over `clsx`.
 *
 * Its job is the name: Tailwind's editor tooling (IntelliSense completions and hints, and Prettier's
 * class sorting) only looks inside a class *attribute* or a configured function call, so a bare
 * `const tone = 'text-card-red'` gets neither. Wrap class strings kept outside the template — in a
 * `<script>` or a `.ts` file — in `cn()`. The strings stay whole literals, so Tailwind's source
 * scanner still sees every class.
 */
import { clsx, type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]): string => clsx(inputs);
