namespace Havit.Blazor.Documentation.Model;

// Simplified replacements for LoxSmoke.DocXml comment types.
// XML doc reading is omitted for the benchmark app.

public class TypeComments
{
	public string Summary { get; set; }
}

public class CommonComments
{
	public string Summary { get; set; }
}

public class MethodComments
{
	public string Summary { get; set; }
}

public class EnumComments
{
	public List<EnumValueComment> ValueComments { get; set; } = new();
}

public class EnumValueComment
{
	public string Name { get; set; }
	public string Summary { get; set; }
}
