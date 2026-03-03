declare module '*/SplitText' {
    export class SplitText {
        constructor(targets: string | Element | Element[] | null, vars?: object);
        chars: Element[];
        words: Element[];
        lines: Element[];
        revert(): void;
        split(vars: object): SplitText;
    }
}

declare module '*/CustomEase' {
    export class CustomEase {
        static create(id: string, data: string): string;
        static get(id: string): any;
        static register(core: any): void;
    }
}

declare module '*/MorphSVGPlugin' {
    export const MorphSVGPlugin: any;
}
