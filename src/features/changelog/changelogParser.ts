export interface ReleaseNote {
    version: string;
    date: string;
    title: string;
    bullets: string[];
    highlights: string[];
    body: string;
}

export function parseReleaseNotes(markdown: string): ReleaseNote[] {
    const lines = markdown.split(/\r?\n/);
    const headingIndices: number[] = [];

    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].startsWith('## [')) headingIndices.push(i);
    }

    return headingIndices.map((start, idx) => {
        const end = idx + 1 < headingIndices.length ? headingIndices[idx + 1] : lines.length;
        const section = lines.slice(start, end);
        const header = section[0] ?? '';
        const headerMatch = header.match(/^## \[([^\]]+)\]\s*[-\u2014]\s*(.+)$/);

        const version = headerMatch?.[1]?.trim() ?? 'Unknown';
        const date = headerMatch?.[2]?.trim() ?? '';
        const contentLines = section
            .slice(1)
            .filter((line) => line.trim() !== '---')
            .filter((line) => {
                const normalized = line.trim().toLowerCase();
                return !normalized.startsWith('**author:**') && !normalized.startsWith('**based on:**');
            });
        const body = contentLines.join('\n').trim();

        const titleLine = contentLines.find((line) => line.startsWith('### '));
        const title = titleLine ? titleLine.replace(/^###\s+/, '').trim() : 'Release update';
        const highlights = contentLines
            .filter((line) => line.startsWith('#### '))
            .map((line) => line.replace(/^####\s+/, '').replace(/^\d+\)\s*/, '').trim())
            .slice(0, 4);
        const bullets = contentLines
            .filter((line) => line.startsWith('- '))
            .map((line) => line.replace(/^- /, '').trim())
            .slice(0, 4);

        return { version, date, title, bullets, highlights, body };
    });
}
