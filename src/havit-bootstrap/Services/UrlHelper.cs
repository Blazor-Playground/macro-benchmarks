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
			System.Diagnostics.Debugger.Break();
		}
#endif
		int hashIndex = url.IndexOf('#');
		return (hashIndex == -1) ? url : url.Substring(0, hashIndex);
	}
}
