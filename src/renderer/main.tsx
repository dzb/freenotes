import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/globals.css';
import './styles/editor.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
