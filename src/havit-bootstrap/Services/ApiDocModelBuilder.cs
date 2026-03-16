using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;
using Havit.Blazor.Documentation.Model;
using Microsoft.JSInterop;

namespace Havit.Blazor.Documentation.Services;

public class ApiDocModelBuilder : IApiDocModelBuilder
{
	private static readonly Dictionary<string, string> s_inputBaseSummaries = new()
	{
		["AdditionalAttributes"] = "A collection of additional attributes that will be applied to the created element.",
		["Value"] = "Value of the input. This should be used with two-way binding.",
		["ValueExpression"] = "An expression that identifies the bound value.",
		["ValueChanged"] = "A callback that updates the bound value.",
		["ChildContent"] = "Content of the component.",
		["Enabled"] = "When <code>null</code> (default), the Enabled value is received from cascading <code>FormState</code>.\n"
			+ "When value is <code>false</code>, input is rendered as disabled.\n"
			+ "To set multiple controls as disabled use <code>HxFormState</code>.",
		["DisplayName"] = "Gets or sets the display name for this field.<br/>This value is used when generating error messages when the input value fails to parse correctly."
	};

	private static readonly List<string> s_ignoredMethods = new()
	{
		"ToString",
		"GetType",
		"Equals",
		"GetHashCode",
		"ReferenceEquals",
		"Dispose",
		"DisposeAsync",
		"SetParametersAsync",
		"ChildContent"
	};

	private static readonly List<Type> s_attributesForMethodFiltering = new()
	{
		typeof(JSInvokableAttribute),
		typeof(CompilerGeneratedAttribute)
	};

	private const BindingFlags CommonBindingFlags = BindingFlags.FlattenHierarchy | BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static;

	public ApiDocModel BuildModel(Type type)
	{
		var model = new ApiDocModel();
		model.Type = type;
		model.IsDelegate = ApiTypeHelper.IsDelegate(type);

		MapClassModel(model);

		if (model.IsDelegate)
		{
			AdjustDelegate(model);
		}
		else
		{
			MapProperties(model);
			MapMethods(model);
			MapEnum(model);
		}

		return model;
	}

	private void AdjustDelegate(ApiDocModel model)
	{
		MethodInfo invokeMethodInfo = model.Type.GetMethod("Invoke");
		string returnType;

		var genericTypeArgument = invokeMethodInfo.ReturnType.GetGenericArguments().FirstOrDefault();

		if (genericTypeArgument is not null)
		{
			string genericTypeArgumentName = genericTypeArgument.ToString();
			returnType = $"Task&lt;{ApiRenderer.FormatType(genericTypeArgumentName, true)}&gt; ";
		}
		else
		{
			returnType = ApiRenderer.FormatType(invokeMethodInfo.ReturnType, true);
		}

		model.DelegateSignature = $"{returnType} {ApiRenderer.FormatType(model.Type, false)} (";
		foreach (ParameterInfo param in invokeMethodInfo.GetParameters())
		{
			model.DelegateSignature += $"{ApiRenderer.FormatType(param.ParameterType)} {param.Name}";
		}
		model.DelegateSignature += ")";
	}

	private void MapEnum(ApiDocModel model)
	{
		model.IsEnum = model.Type.IsEnum;
		if (!model.IsEnum)
		{
			return;
		}

		string[] names = model.Type.GetEnumNames();
		var values = model.Type.GetEnumValues();
		for (int i = 0; i < names.Length; i++)
		{
			var enumMember = new EnumModel();
			enumMember.Name = names[i];
			enumMember.Value = (int)values.GetValue(i);
			model.EnumMembers.Add(enumMember);
		}
	}

	private void MapClassModel(ApiDocModel model)
	{
		model.Class = new ClassModel()
		{
			Comments = new TypeComments()
		};
	}

	private void MapProperties(ApiDocModel model)
	{
		List<PropertyInfo> propertyInfos = model.Type.GetProperties(CommonBindingFlags).ToList();

		// Generic components have their defaults stored in a separate non-generic class
		if (model.Type.IsGenericType)
		{
			Type nongenericType = Type.GetType($"Havit.Blazor.Components.Web.Bootstrap.{ApiRenderer.RemoveSpecialCharacters(model.Type.Name)}, Havit.Blazor.Components.Web.Bootstrap");
			if (nongenericType is not null)
			{
				propertyInfos = propertyInfos.Concat(nongenericType.GetProperties(CommonBindingFlags)).ToList();
			}
		}

		foreach (var propertyInfo in propertyInfos)
		{
			var newProperty = new PropertyModel();
			newProperty.PropertyInfo = propertyInfo;
			newProperty.Comments = new CommonComments();

			if (string.IsNullOrWhiteSpace(newProperty.Comments.Summary))
			{
				if (s_inputBaseSummaries.TryGetValue(newProperty.PropertyInfo.Name, out string summary))
				{
					newProperty.Comments = new CommonComments { Summary = summary };
				}
			}

			if (IsEventCallback(newProperty))
			{
				model.Events.Add(newProperty);
			}
			else if (propertyInfo.GetCustomAttribute<ParameterAttribute>() is not null)
			{
				newProperty.EditorRequired = (propertyInfo.GetCustomAttribute<EditorRequiredAttribute>() is not null);
				model.Parameters.Add(newProperty);
			}
			else if (newProperty.IsStatic)
			{
				model.StaticProperties.Add(newProperty);
			}
			else
			{
				model.Properties.Add(newProperty);
			}
		}
	}

	private void MapMethods(ApiDocModel model)
	{
		foreach (var methodInfo in model.Type.GetMethods(CommonBindingFlags))
		{
			if (ShouldIncludeMethod(methodInfo))
			{
				var newMethod = new MethodModel();
				newMethod.MethodInfo = methodInfo;
				newMethod.Comments = new MethodComments();

				if (newMethod.MethodInfo.IsStatic)
				{
					model.StaticMethods.Add(newMethod);
				}
				else
				{
					model.Methods.Add(newMethod);
				}
			}
		}
	}

	private bool ShouldIncludeMethod(MethodInfo methodInfo)
	{
		foreach (var attribute in s_attributesForMethodFiltering)
		{
			if (methodInfo.GetCustomAttribute(attribute) is not null)
			{
				return false;
			}
		}

		if (methodInfo.IsSpecialName)
		{
			return false;
		}

		string name = methodInfo.Name;
		if (s_ignoredMethods.Contains(name))
		{
			return false;
		}

		return true;
	}

	private bool IsEventCallback(PropertyModel property)
	{
		string propertyName = property.PropertyInfo.Name;

		if (propertyName.EndsWith("Changed") && !Regex.IsMatch(propertyName, @"^On[A-Z]"))
		{
			return false;
		}

		return (property.PropertyInfo.PropertyType.IsGenericType && (property.PropertyInfo.PropertyType.GetGenericTypeDefinition() == typeof(EventCallback<>)))
			|| property.PropertyInfo.PropertyType == typeof(EventCallback);
	}
}
