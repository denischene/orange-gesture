import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Ne pas rediriger /memo/ -> /memo : le prerender statique demande la
    // forme avec slash final et tournerait en boucle de redirections.
    trailingSlash: "preserve",
  });

  return router;
};
