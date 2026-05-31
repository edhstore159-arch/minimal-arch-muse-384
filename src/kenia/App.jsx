import "@/kenia/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/kenia/components/ui/sonner";
import { AuthProvider, useAuth } from "@/kenia/contexts/AuthContext";
import { DebugErrorThrower } from "@/components/DebugErrorThrower";
import { ErrorDebugPopup } from "@/components/ErrorDebugPopup";

import Landing from "@/kenia/pages/Landing";
import Login from "@/kenia/pages/Login";
import Dashboard from "@/kenia/pages/Dashboard";
import CRM from "@/kenia/pages/CRM";
import Processes from "@/kenia/pages/Processes";
import Finance from "@/kenia/pages/Finance";
import Creatives from "@/kenia/pages/Creatives";
import ImageFusion from "@/kenia/pages/ImageFusion";
import Analytics from "@/kenia/pages/Analytics";
import WhatsAppSettings from "@/kenia/pages/WhatsAppSettings";
import WhatsAppLogs from "@/kenia/pages/WhatsAppLogs";
import Agenda from "@/kenia/pages/Agenda";
import Onboarding from "@/kenia/pages/Onboarding";
import Consulta from "@/kenia/pages/Consulta";
import Settings from "@/kenia/pages/Settings";
import DebugTool from "@/kenia/pages/DebugTool";
import ChatIA from "@/kenia/pages/ChatIA";
import AdminCases from "@/kenia/pages/AdminCases";
import AppLayout from "@/kenia/components/AppLayout";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      {/* Captura instruções de debug sem derrubar a aplicação */}
      <DebugErrorThrower />
      <ErrorDebugPopup />
      <AuthProvider>
        <BrowserRouter>

          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/consulta" element={<Consulta />} />
            {/* Admin debug tool — sempre acessível, sem auth */}
            <Route path="/admin/debug" element={<DebugTool />} />
            <Route path="/app/debug" element={<DebugTool />} />
            <Route
              element={
                <Protected>
                  <AppLayout />
                </Protected>
              }
            >
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/chat-ia" element={<ChatIA />} />
              <Route path="/app/admin" element={<AdminCases />} />
              <Route path="/app/onboarding" element={<Onboarding />} />
              <Route path="/app/agenda" element={<Agenda />} />
              <Route path="/app/crm" element={<CRM />} />
              <Route path="/app/processes" element={<Processes />} />
              <Route path="/app/finance" element={<Finance />} />
              <Route path="/app/creatives" element={<Creatives />} />
              <Route path="/app/image-fusion" element={<ImageFusion />} />
              <Route path="/app/analytics" element={<Analytics />} />
              <Route path="/app/whatsapp" element={<WhatsAppSettings />} />
              <Route path="/app/whatsapp-logs" element={<WhatsAppLogs />} />
              <Route path="/app/settings" element={<Settings />} />
            </Route>
          </Routes>

        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
