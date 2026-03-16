using System.Text.RegularExpressions;

namespace Havit.Blazor.Documentation;

public static partial class StringExtensions
{
	public static string NormalizeForUrl(this string value)
	{
		if (string.IsNullOrWhiteSpace(value))
		{
			return string.Empty;
		}

		string result = value.ToLowerInvariant();
		result = NormalizeForUrlRegex().Replace(result, "");
		result = result.Replace(' ', '-');
		result = MultipleHyphensRegex().Replace(result, "-");
		result = result.Trim('-');

		return result;
	}

	[GeneratedRegex("[^a-z0-9 -]")]
	private static partial Regex NormalizeForUrlRegex();

	[GeneratedRegex("-{2,}")]
	private static partial Regex MultipleHyphensRegex();
}
