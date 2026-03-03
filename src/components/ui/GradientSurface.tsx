import React from 'react';
import { getGradientRecipe, type GradientThemeKey, type GradientSurfaceId } from '../../styles/gradient-tokens';

type Props<T extends React.ElementType = 'div'> = {
  as?: T;
  theme: GradientThemeKey;
  surface: GradientSurfaceId;
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className' | 'style'>;

export default function GradientSurface<T extends React.ElementType = 'div'>(props: Props<T>) {
  const { as, theme, surface, className, children, style, ...rest } = props;
  const Comp = (as || 'div') as React.ElementType;
  const recipe = getGradientRecipe(theme, surface);
  return (
    <Comp
      className={className}
      style={{
        background: recipe.background,
        border: recipe.border,
        boxShadow: recipe.shadow,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Comp>
  );
}
