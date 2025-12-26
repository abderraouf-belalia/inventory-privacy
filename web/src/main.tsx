import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SuiProvider } from './sui/provider'
import App from './App'
import './index.css'
import '@mysten/dapp-kit/dist/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SuiProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SuiProvider>
  </React.StrictMode>,
)
