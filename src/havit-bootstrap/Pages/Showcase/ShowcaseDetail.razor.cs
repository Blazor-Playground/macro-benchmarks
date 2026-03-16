using Havit.Blazor.Documentation.Pages.Showcase.Data;

namespace Havit.Blazor.Documentation.Pages.Showcase;

public partial class ShowcaseDetail
{
	[Inject] private IShowcaseDataService _showcaseDataService { get; set; }

	[Parameter] public string Id { get; set; }

	private ShowcaseModel _showcase;
	private ShowcaseModel _previousShowcase;
	private ShowcaseModel _nextShowcase;

	protected override void OnParametersSet()
	{
		if (_showcase?.Id != Id)
		{
			_showcase = _showcaseDataService.GetShowcase(Id);
			_previousShowcase = _showcaseDataService.GetPreviousShowcase(Id);
			_nextShowcase = _showcaseDataService.GetNextShowcase(Id);
		}
	}
}