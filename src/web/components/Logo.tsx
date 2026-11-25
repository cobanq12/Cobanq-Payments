import { cn } from './cn';

/** Natural size of public/logo.png, used to reserve space and keep the aspect ratio. */
const LOGO_WIDTH = 1083;
const LOGO_HEIGHT = 398;

/**
 * The Cobanq logo (public/logo.png). This is the only place it is drawn in the
 * web app — shell, sign-in and the approval dialog all use this component.
 * It is always shown at its own aspect ratio and in its own colours, with clear
 * space around it; never stretch or recolour it.
 */
export function Logo({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const height = size === 'lg' ? 'h-12' : size === 'sm' ? 'h-8' : 'h-10';
  return (
    <span className={cn('inline-flex shrink-0 select-none p-1', className)}>
      <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Cobanq" width={LOGO_WIDTH} height={LOGO_HEIGHT} className={cn(height, 'w-auto max-w-none')} draggable={false} />
    </span>
  );
}
