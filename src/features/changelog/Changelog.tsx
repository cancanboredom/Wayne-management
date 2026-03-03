import React, { useEffect, useMemo, useState } from 'react';
import { History, ExternalLink, RefreshCw, GitBranch, GitCommit, AlertCircle, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { GsapScrollReveal } from '../../components/animations/GsapScrollReveal';
import { GsapPremiumText } from '../../components/animations/GsapPremiumText';
import { GsapMagnetic } from '../../components/animations/GsapMagnetic';
import changelogMarkdown from '../../../CHANGELOG.md?raw';
import { parseReleaseNotes } from './changelogParser';
import { getGradientRecipe } from '../../styles/gradient-tokens';

interface GitHubCommit {
    sha: string;
    commit: {
        message: string;
        author: {
            name: string;
            date: string;
        };
    };
    html_url: string;
    author: {
        avatar_url: string;
        login: string;
    };
}

export default function Changelog() {
    const [commits, setCommits] = useState<GitHubCommit[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const releaseNotes = useMemo(() => parseReleaseNotes(changelogMarkdown), []);
    const latestVersion = releaseNotes[0]?.version ?? 'v5.1';
    const shellBg = getGradientRecipe('changelog', 'page-bg');
    const heroBg = getGradientRecipe('changelog', 'hero-bg');

    useEffect(() => {
        const fetchCommits = async () => {
            try {
                const response = await fetch('https://api.github.com/repos/Oat9898/Wayne-management/commits?per_page=5');
                if (!response.ok) throw new Error('Failed to fetch updates from GitHub');
                const data = await response.json();
                setCommits(data);
            } catch (err) {
                console.error('GitHub Fetch Error:', err);
                setError('Could not load recent GitHub activity.');
            } finally {
                setLoading(false);
            }
        };

        fetchCommits();
    }, []);

    return (
        <div
            className="ui-page-root flex-1 overflow-auto p-4 sm:p-6 md:p-8 h-full relative"
            style={{ background: shellBg.background }}
        >
            {/* Background Decorative Gradient */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-br from-emerald-200/30 via-emerald-100/10 to-transparent blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-gradient-to-tl from-teal-100/20 to-transparent blur-[100px]" />
            </div>

            <div className="max-w-6xl mx-auto relative z-10">
                <GsapScrollReveal direction="up" distance={20}>
                    <div className="ui-panel-raised mb-8 rounded-3xl p-5 sm:p-6 md:p-8 border border-emerald-100 backdrop-blur-sm" style={{ background: heroBg.background }}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4">
                                <GsapMagnetic>
                                    <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
                                        <History className="w-6 h-6 text-emerald-600" />
                                    </div>
                                </GsapMagnetic>
                                <div>
                                    <GsapPremiumText
                                        text="What's New"
                                        as="h1"
                                        className="text-3xl caps-title text-gray-900 mb-1"
                                    />
                                    <p className="text-gray-500">Release notes powered by `CHANGELOG.md`.</p>
                                </div>
                            </div>
                            <div className="shrink-0 inline-flex items-center gap-2 text-xs caps-micro px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                                <Sparkles className="w-3.5 h-3.5" />
                                Latest {latestVersion}
                            </div>
                        </div>
                    </div>
                </GsapScrollReveal>

                <div className="grid grid-cols-1 gap-6 mb-8">
                    {releaseNotes.slice(0, 3).map((note, index) => (
                        <GsapScrollReveal key={`${note.version}-${note.date}`} direction="up" delay={0.05 * index}>
                            <section className="ui-panel h-full rounded-3xl p-6 hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <span className={`text-xs caps-micro px-2.5 py-1 rounded-full ${index === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                                        {note.version}
                                    </span>
                                    <span className="text-xs text-gray-400">{note.date}</span>
                                </div>
                                <h3 className="text-base caps-title text-gray-900 leading-tight">{note.title}</h3>
                                <ul className="mt-4 space-y-2.5">
                                    {note.bullets.length > 0 ? note.bullets.map((bullet, i) => (
                                        <li key={i} className="text-sm text-gray-600 leading-relaxed flex gap-2">
                                            <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                            <span>{bullet}</span>
                                        </li>
                                    )) : (
                                        <li className="text-sm text-gray-500">Details available in full release notes.</li>
                                    )}
                                </ul>
                            </section>
                        </GsapScrollReveal>
                    ))}
                </div>

                <div className="space-y-8">
                    <GsapScrollReveal direction="up" delay={0.2}>
                        <section className="ui-panel rounded-3xl p-6 md:p-8">
                            <div className="flex items-center gap-2 mb-6">
                                <History className="w-5 h-5 text-gray-400" />
                                <h2 className="text-lg caps-title text-gray-700">Full Release Notes</h2>
                            </div>
                            <div className="grid grid-cols-1 gap-6">
                                {releaseNotes.map((note) => (
                                    <article key={`full-${note.version}-${note.date}`} className="ui-panel-subtle rounded-2xl p-5">
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <span className="text-xs caps-micro px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">{note.version}</span>
                                            <span className="text-xs text-gray-400">{note.date}</span>
                                        </div>
                                        <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:tracking-tight prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-a:text-emerald-600 hover:prose-a:text-emerald-700">
                                            <ReactMarkdown
                                                components={{
                                                    h4: ({ children }) => (
                                                        <h4 className="mt-4 mb-2 text-emerald-800 font-extrabold tracking-tight">
                                                            {children}
                                                        </h4>
                                                    ),
                                                }}
                                            >
                                                {note.body}
                                            </ReactMarkdown>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    </GsapScrollReveal>

                    <GsapScrollReveal direction="up" distance={20}>
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <GitBranch className="w-5 h-5 text-gray-400" />
                                <h2 className="text-lg caps-title text-gray-700">Recent GitHub Activity</h2>
                            </div>

                            {loading ? (
                                <div className="ui-panel rounded-3xl p-8 flex flex-col items-center justify-center min-h-[200px] animate-pulse">
                                    <RefreshCw className="w-8 h-8 text-gray-300 animate-spin mb-4" />
                                    <p className="text-gray-400 font-medium">Fetching latest commits...</p>
                                </div>
                            ) : error ? (
                                <div className="bg-red-50 rounded-3xl p-8 border border-red-100 flex items-center gap-4">
                                    <AlertCircle className="w-8 h-8 text-red-500" />
                                    <div>
                                        <h3 className="caps-title text-red-800">Connection Issue</h3>
                                        <p className="text-red-600 text-sm">{error}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="ui-panel rounded-3xl overflow-hidden">
                                    {commits.map((commit, index) => (
                                        <a
                                            key={commit.sha}
                                            href={commit.html_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`flex items-start gap-4 p-5 hover:bg-gray-50 transition-colors group ${index !== commits.length - 1 ? 'border-b border-gray-50' : ''}`}
                                        >
                                            <div className="relative">
                                                <img
                                                    src={commit.author?.avatar_url || 'https://github.com/identicons/git.png'}
                                                    alt={commit.author?.login}
                                                    className="w-10 h-10 rounded-full border-2 border-white shadow-sm transition-transform group-hover:scale-110"
                                                />
                                                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                                                    <GitCommit className="w-3 h-3 text-emerald-500" />
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm caps-ui text-gray-900 truncate group-hover:text-emerald-600 transition-colors">
                                                        {commit.commit.message.split('\n')[0]}
                                                    </span>
                                                    <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap bg-gray-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                        {formatDistanceToNow(new Date(commit.commit.author.date), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <span className="font-medium text-emerald-600 group-hover:underline underline-offset-2">@{commit.author?.login || commit.commit.author.name}</span>
                                                    <span>&middot;</span>
                                                    <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded text-[10px]">{commit.sha.substring(0, 7)}</span>
                                                </div>
                                            </div>
                                            <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition-colors transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </section>
                    </GsapScrollReveal>
                </div>

                <div className="mt-8 text-center pb-8 border-t border-gray-100 pt-8">
                    <GsapMagnetic>
                        <a
                            href="https://github.com/Oat9898/Wayne-management/commits/main"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm caps-ui text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-4 py-2 rounded-xl transition-colors"
                        >
                            View Full Git History <ExternalLink className="w-4 h-4" />
                        </a>
                    </GsapMagnetic>
                </div>
            </div>
        </div>
    );
}
