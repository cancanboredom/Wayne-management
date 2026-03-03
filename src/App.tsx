import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/Layout/AppLayout';

import CalendarDashboard from './features/calendar/CalendarDashboard';
import PersonnelManager from './features/personnel/PersonnelManager';
import SettingsRules from './features/rules/SettingsRules';
import AppSettings from './features/settings/AppSettings';
import Changelog from './features/changelog/Changelog';
import CumulativeDashboard from './features/cumulative/CumulativeDashboard';

type BoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    // Keep console visibility for debugging.
    // eslint-disable-next-line no-console
    console.error('App runtime error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: '#fff8f8' }}>
        <div style={{ maxWidth: 680, width: '100%', border: '1px solid #fecaca', background: '#fff', borderRadius: 14, padding: 20 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: '#991b1b' }}>Runtime Error</h1>
          <p style={{ marginTop: 10, fontSize: 14, color: '#7f1d1d' }}>
            {this.state.message || 'Unknown runtime error'}
          </p>
          <p style={{ marginTop: 8, fontSize: 12, color: '#9f1239' }}>
            Open DevTools Console for stack trace.
          </p>
        </div>
      </div>
    );
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<CalendarDashboard />} />
            <Route path="team" element={<PersonnelManager />} />
            <Route path="settings" element={<SettingsRules />} />
            <Route path="app-settings" element={<AppSettings />} />
            <Route path="changelog" element={<Changelog />} />
            <Route path="cumulative" element={<CumulativeDashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
