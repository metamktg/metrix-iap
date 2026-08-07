import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Command Deck's dark mode is the source-native Metrix theme.
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(<App />);
