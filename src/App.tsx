import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useContext } from "react";
import { Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Discover from "./pages/Discover";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import MyEvents from "./pages/MyEvents";
import CreateEvent from "./pages/CreateEvent";
import EditEvent from "./pages/EditEvent";
import NotFound from "./pages/NotFound";
import { DebugErrorThrower } from "./components/DebugErrorThrower";
import { ErrorDebugPopup } from "./components/ErrorDebugPopup";
import { ClonedAuthProvider, clonedRoutes } from "./cloned/ClonedRoutes";
import { AuthContext as ClonedAuthContext } from "./cloned/ClonedAuthContext";

const AppRoutes = () => {
  const { user } = useContext(ClonedAuthContext) as { user: { role?: string } | null };

  return (
    <Routes>
      {clonedRoutes(user)}
      <Route path="/discover" element={<Discover />} />
      <Route path="/event/:id" element={<Index />} />
      <Route path="/event/:id/edit" element={<EditEvent />} />
      <Route path="/my-events" element={<MyEvents />} />
      <Route path="/create-event" element={<CreateEvent />} />
      <Route path="/legacy/auth" element={<Auth />} />
      <Route path="/legacy/admin" element={<Admin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <TooltipProvider>
    {/* DebugErrorThrower DEVE ficar fora de qualquer ErrorBoundary/Suspense
        para que o erro intencional escape até o overlay global da Lovable. */}
    <DebugErrorThrower />
    <ClonedAuthProvider>
      <ErrorDebugPopup />
      <Toaster />
      <Sonner />
      <AppRoutes />
    </ClonedAuthProvider>
  </TooltipProvider>
);

export default App;
