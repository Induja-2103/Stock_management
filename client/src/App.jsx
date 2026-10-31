import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './tokens.css';
import { LedgerProvider } from './context/LedgerContext';
import BookLayout from './components/BookLayout';
import Ledger from './pages/Ledger';
import AddEntry from './pages/AddEntry';
import Items from './pages/Items';
import Statements from './pages/Statements';

export default function App() {
  return (
    <BrowserRouter>
      <LedgerProvider>
        <Routes>
          <Route element={<BookLayout />}>
            <Route path="/" element={<Navigate to="/ledger" replace />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/entries/new" element={<AddEntry />} />
            <Route path="/items" element={<Items />} />
            <Route path="/statements" element={<Statements />} />
            <Route path="*" element={<Navigate to="/ledger" replace />} />
          </Route>
        </Routes>
      </LedgerProvider>
    </BrowserRouter>
  );
}
