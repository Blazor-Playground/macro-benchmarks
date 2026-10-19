namespace Havit.Blazor.Documentation.Services;

public static class UrlHelper
{
	public static string RemoveFragmentFromUrl(string url)
	{
		if (url == null)
		{
			return null;
		}

#if HAVIT_DEBUGGER_URL_WORKLOAD
		if (url.EndsWith("/components/HxGrid#header-filtering", StringComparison.Ordinal) && System.Diagnostics.Debugger.IsAttached)
		{
			string[] urlParts = url.Split('#');
			System.Diagnostics.Debugger.Break();
		}
#endif
		int hashIndex = url.IndexOf('#');
		return (hashIndex == -1) ? url : url.Substring(0, hashIndex);
	}

#if HAVIT_DEBUGGER_URL_WORKLOAD
	// Debugger workload only: second user break, reached by a plain resume from the first break on the same navigation.
	public static void BreakAfterFragmentRemoved(string url, string pageKey)
	{
		if (url.EndsWith("/components/HxGrid#header-filtering", StringComparison.Ordinal) && System.Diagnostics.Debugger.IsAttached)
		{
			string[] removedParts = new[] { pageKey, url.Substring(pageKey.Length) };
			System.Diagnostics.Debugger.Break();
			GC.KeepAlive(removedParts);
		}
	}
#endif
}
